import { asc, eq } from 'drizzle-orm'
import type { Card } from '@shared/types'
import type { AppDatabase } from '../db/client'
import { cards, conversations, messages } from '../db/schema'
import { createCardRepository } from '../db/repositories/cards'
import { completeChat } from './client'
import { countTokens } from './tokens'

export const TITLE_SOURCE_TOKEN_BUDGET = 2000
export const TITLE_MAX_OUTPUT_TOKENS = 64
export const TITLE_MAX_LENGTH = 24

const TITLE_SYSTEM_PROMPT = [
  '你是一个标题助手。',
  '请根据给定对话，为这张卡片生成一个简洁的主题标题：',
  '- 使用简体中文；',
  '- 6 到 20 个字；',
  '- 不要使用引号、书名号、句号或任何解释；',
  '- 只输出标题本身。'
].join('\n')

export function sanitizeTitle(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/^[#\s"'“”‘’《》「」【】]+/, '')
    .replace(/["'“”‘’《》。，,.\s」】]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TITLE_MAX_LENGTH)
}

export async function generateCardTitle(options: {
  db: AppDatabase
  cardId: string
  profile: { baseUrl: string; model: string; temperature: number; apiKey?: string }
  completeFn?: typeof completeChat
}): Promise<Card | null> {
  const { db, cardId, profile } = options
  const complete = options.completeFn ?? completeChat

  const card = db.select().from(cards).where(eq(cards.id, cardId)).get()
  if (!card) return null

  const conversation = db
    .select()
    .from(conversations)
    .where(eq(conversations.cardId, cardId))
    .get()
  if (!conversation) return null

  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.turnIndex), asc(messages.createdAt))
    .all()
    .filter(
      (message) =>
        (message.role === 'user' || message.isActiveVariant) && message.content.trim().length > 0
    )
  if (rows.length === 0) return null

  const picked: string[] = []
  let used = 0
  for (const message of rows) {
    const cost = countTokens(message.content)
    if (used + cost > TITLE_SOURCE_TOKEN_BUDGET) break
    used += cost
    picked.push(`${message.role === 'user' ? '用户' : 'AI'}：${message.content.trim()}`)
  }

  const raw = await complete({
    baseUrl: profile.baseUrl,
    model: profile.model,
    temperature: 0.3,
    apiKey: profile.apiKey,
    messages: [
      { role: 'system', content: TITLE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `卡片当前标题：${card.title}\n\n对话记录：\n${picked.join('\n\n')}`
      }
    ],
    maxTokens: TITLE_MAX_OUTPUT_TOKENS
  })

  const title = sanitizeTitle(raw)
  if (!title) return null
  return createCardRepository(db).setGeneratedTitle(cardId, title)
}
