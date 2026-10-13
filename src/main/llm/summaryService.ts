import { asc, eq } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import { cards, conversations, messages } from '../db/schema'
import { createSummaryRepository } from '../db/repositories/summaries'
import { completeChat } from './client'
import { shouldRebuildSummary } from './summaryPolicy'
import { countTokens } from './tokens'

export const SUMMARY_SOURCE_TOKEN_BUDGET = 4000
export const SUMMARY_MAX_OUTPUT_TOKENS = 600

const SUMMARY_SYSTEM_PROMPT = [
  '你是一个对话摘要助手。',
  '请用简体中文把给定对话概括为一段紧凑的背景摘要，保留关键概念、结论、未解决的问题和用户的偏好，供后续子话题对话作为背景使用。',
  '不要使用 Markdown 标题，直接输出 150-400 字的摘要。'
].join('\n')

export type SummaryOutcome = 'skipped' | 'updated' | 'failed'

export interface SummaryProfile {
  baseUrl: string
  model: string
  temperature: number
  apiKey?: string
}

export async function refreshCardSummaryIfNeeded(options: {
  db: AppDatabase
  cardId: string
  profile: SummaryProfile
  completeFn?: typeof completeChat
}): Promise<SummaryOutcome> {
  const { db, cardId, profile } = options
  const complete = options.completeFn ?? completeChat

  const card = db.select().from(cards).where(eq(cards.id, cardId)).get()
  if (!card) return 'skipped'

  const conversation = db
    .select()
    .from(conversations)
    .where(eq(conversations.cardId, cardId))
    .get()
  if (!conversation) return 'skipped'

  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.turnIndex), asc(messages.createdAt))
    .all()
    .filter((message) => message.role === 'user' || message.isActiveVariant)
  if (rows.length === 0) return 'skipped'

  const tokenCount = rows.reduce((sum, message) => sum + countTokens(message.content), 0)
  const baseline = createSummaryRepository(db).get(cardId)
  if (!shouldRebuildSummary(baseline, rows.length, tokenCount)) return 'skipped'

  const picked: string[] = []
  let used = 0
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const message = rows[index]
    const cost = countTokens(message.content)
    if (used + cost > SUMMARY_SOURCE_TOKEN_BUDGET) break
    used += cost
    picked.unshift(`${message.role === 'user' ? '用户' : 'AI'}：${message.content.trim()}`)
  }

  try {
    const summary = await complete({
      baseUrl: profile.baseUrl,
      model: profile.model,
      temperature: profile.temperature,
      apiKey: profile.apiKey,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: `卡片标题：${card.title}\n\n对话记录：\n${picked.join('\n\n')}` }
      ],
      maxTokens: SUMMARY_MAX_OUTPUT_TOKENS
    })
    const trimmed = summary.trim()
    if (!trimmed) return 'failed'
    createSummaryRepository(db).upsert({
      cardId,
      summarizedMessageCount: rows.length,
      summarizedTokenCount: tokenCount,
      summary: trimmed
    })
    return 'updated'
  } catch {
    return 'failed'
  }
}
