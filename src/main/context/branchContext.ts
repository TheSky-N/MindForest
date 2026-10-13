import { asc, eq } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import { cards, conversations, messages } from '../db/schema'

export interface BranchContext {
  sourceCardId: string
  sourceCardTitle: string
  fromMessageId: string
  inheritedTurnCount: number
  text: string
}

export function buildBranchContext(
  db: AppDatabase,
  input: { sourceCardId: string; fromMessageId: string }
): BranchContext {
  const sourceCard = db.select().from(cards).where(eq(cards.id, input.sourceCardId)).get()
  if (!sourceCard) throw new Error('来源卡片不存在')

  const conversation = db
    .select()
    .from(conversations)
    .where(eq(conversations.cardId, sourceCard.id))
    .get()
  if (!conversation) throw new Error('来源卡片还没有对话')

  const all = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.turnIndex), asc(messages.createdAt))
    .all()

  const branchIndex = all.findIndex((message) => message.id === input.fromMessageId)
  if (branchIndex === -1) throw new Error('分支点消息不属于来源卡片')

  const inherited = all
    .slice(0, branchIndex + 1)
    .filter((message) => message.role === 'user' || message.isActiveVariant)
  const turnCount = inherited.filter((message) => message.role === 'user').length
  const lines = inherited.map(
    (message) => `${message.role === 'user' ? '用户' : 'AI'}：${message.content.trim()}`
  )

  const prefix = sourceCard.inheritedContext ? `${sourceCard.inheritedContext}\n\n` : ''
  const text = `${prefix}[以下是「${sourceCard.title}」中分支点之前的对话，共 ${turnCount} 轮]\n\n${lines.join('\n\n')}`

  return {
    sourceCardId: sourceCard.id,
    sourceCardTitle: sourceCard.title,
    fromMessageId: input.fromMessageId,
    inheritedTurnCount: turnCount,
    text
  }
}
