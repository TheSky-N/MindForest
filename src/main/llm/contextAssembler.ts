import { asc, eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import {
  cardSummaries,
  cards,
  conversations,
  messageQuotes,
  messages,
  projects
} from '../db/schema'
import type { ChatMessage } from './client'
import { countTokens } from './tokens'

export const CONTEXT_TOKEN_BUDGET = 12000
export const PARENT_CONTEXT_TOKEN_SHARE = 1500

const BASE_SYSTEM_PROMPT = [
  '你是 MindForest 中的 AI 学习伙伴，帮助用户深入理解与探索各类主题。',
  '要求：',
  '- 使用简体中文回答；',
  '- 使用 Markdown 组织内容，数学公式使用 $...$ 或 $$...$$；',
  '- 回答准确、清晰、不啰嗦，必要时给出例子。'
].join('\n')

export interface AssembledCardContext {
  system: string
  chatMessages: ChatMessage[]
  estimatedTokens: number
  truncated: boolean
}

export interface AssembleContextOptions {
  budget?: number
  uptoTurnIndex?: number
  excludeAssistantTurnIndex?: number
}

function formatMessageContent(content: string, quotes?: string[]): string {
  if (!quotes || quotes.length === 0) return content
  const quoteBlock = quotes.map((quote) => `【用户引用的内容】${quote}`).join('\n')
  return `${quoteBlock}\n\n${content}`
}

function loadHistory(
  db: AppDatabase,
  conversationId: string,
  options: AssembleContextOptions
): ChatMessage[] {
  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.turnIndex), asc(messages.createdAt))
    .all()

  const filtered = rows.filter((message) => {
    if (message.role === 'assistant' && !message.isActiveVariant) return false
    if (options.uptoTurnIndex !== undefined && message.turnIndex > options.uptoTurnIndex) {
      return false
    }
    if (
      options.excludeAssistantTurnIndex !== undefined &&
      message.role === 'assistant' &&
      message.turnIndex === options.excludeAssistantTurnIndex
    ) {
      return false
    }
    return true
  })

  if (filtered.length === 0) return []

  const quoteRows = db
    .select()
    .from(messageQuotes)
    .where(inArray(messageQuotes.messageId, filtered.map((message) => message.id)))
    .orderBy(asc(messageQuotes.createdAt))
    .all()

  const quotesByMessage = new Map<string, string[]>()
  for (const quote of quoteRows) {
    const list = quotesByMessage.get(quote.messageId) ?? []
    list.push(quote.quoteText)
    quotesByMessage.set(quote.messageId, list)
  }

  return filtered.map((message) => ({
    role: message.role,
    content: formatMessageContent(message.content, quotesByMessage.get(message.id))
  }))
}

function buildBackground(db: AppDatabase, cardId: string): string {
  const card = db.select().from(cards).where(eq(cards.id, cardId)).get()
  if (!card) throw new Error('卡片不存在')

  if (card.kind === 'root') {
    const project = db.select().from(projects).where(eq(projects.id, card.projectId)).get()
    return [`【当前主题】${card.title}`, project ? `【项目】${project.name}` : '']
      .filter(Boolean)
      .join('\n')
  }

  if (card.kind === 'branch') {
    return [
      `【分支卡片】${card.title}`,
      '以下是你与用户在该分支点之前已经进行的对话（已冻结，不随来源卡片变化）：',
      card.inheritedContext ?? '（无继承内容）'
    ].join('\n')
  }

  const parent = card.parentCardId
    ? db.select().from(cards).where(eq(cards.id, card.parentCardId)).get()
    : undefined
  if (!parent) return `【当前主题】${card.title}`

  const summary = db
    .select()
    .from(cardSummaries)
    .where(eq(cardSummaries.cardId, parent.id))
    .get()
  if (summary) {
    return `【背景】当前卡片是父卡片「${parent.title}」的子卡片，主题是「${card.title}」。\n\n父卡片对话摘要：\n${summary.summary}`
  }

  const parentConversation = db
    .select()
    .from(conversations)
    .where(eq(conversations.cardId, parent.id))
    .get()

  let excerpt = ''
  if (parentConversation) {
    const parentHistory = loadHistory(db, parentConversation.id, {})
    const picked: string[] = []
    let total = 0
    for (let index = parentHistory.length - 1; index >= 0; index -= 1) {
      const message = parentHistory[index]
      const cost = countTokens(message.content)
      if (total + cost > PARENT_CONTEXT_TOKEN_SHARE) break
      total += cost
      picked.unshift(`${message.role === 'user' ? '用户' : 'AI'}：${message.content.trim()}`)
    }
    if (picked.length > 0) {
      excerpt = `\n\n父卡片最近的对话节选：\n${picked.join('\n\n')}`
    }
  }

  return `【背景】当前卡片是父卡片「${parent.title}」的子卡片，主题是「${card.title}」。${excerpt}`
}

export function assembleCardContext(
  db: AppDatabase,
  cardId: string,
  options: AssembleContextOptions = {}
): AssembledCardContext {
  const budget = options.budget ?? CONTEXT_TOKEN_BUDGET
  const background = buildBackground(db, cardId)
  const system = `${BASE_SYSTEM_PROMPT}\n\n${background}`

  const conversation = db
    .select()
    .from(conversations)
    .where(eq(conversations.cardId, cardId))
    .get()
  const history = conversation ? loadHistory(db, conversation.id, options) : []

  const tokenOf = (message: ChatMessage) => countTokens(message.content)
  let total = countTokens(system) + history.reduce((sum, message) => sum + tokenOf(message), 0)
  let start = 0
  let truncated = false

  while (total > budget && start < history.length - 1) {
    total -= tokenOf(history[start])
    start += 1
    truncated = true
  }

  return {
    system,
    chatMessages: history.slice(start),
    estimatedTokens: total,
    truncated
  }
}
