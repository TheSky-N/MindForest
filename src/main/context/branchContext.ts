import { asc, eq } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import { cards, conversations, messages } from '../db/schema'

export interface BranchContext {
  sourceCardId: string
  sourceCardTitle: string
  fromMessageId: string | null
  inheritedTurnCount: number
  text: string
}

export function buildBranchContext(
  db: AppDatabase,
  input: { sourceCardId: string; fromMessageId?: string | null }
): BranchContext {
  const sourceCard = db.select().from(cards).where(eq(cards.id, input.sourceCardId)).get()
  if (!sourceCard) throw new Error('来源卡片不存在')

  const conversation = db
    .select()
    .from(conversations)
    .where(eq(conversations.cardId, sourceCard.id))
    .get()
  if (!conversation) throw new Error('该卡片还没有对话，无法建立分支')

  const all = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.turnIndex), asc(messages.createdAt))
    .all()

  let inherited = all
  let fromMessageId: string | null = null

  if (input.fromMessageId) {
    const branchIndex = all.findIndex((message) => message.id === input.fromMessageId)
    if (branchIndex === -1) throw new Error('分支点消息不属于来源卡片')
    inherited = all.slice(0, branchIndex + 1)
    fromMessageId = input.fromMessageId
  }

  const filtered = inherited.filter(
    (message) => message.role === 'user' || message.isActiveVariant
  )
  if (filtered.length === 0) throw new Error('该卡片还没有对话，无法建立分支')

  const turnCount = filtered.filter((message) => message.role === 'user').length
  const lines = filtered.map(
    (message) => `${message.role === 'user' ? '用户' : 'AI'}：${message.content.trim()}`
  )

  const prefix = sourceCard.inheritedContext ? `${sourceCard.inheritedContext}\n\n` : ''
  const text = `${prefix}[以下是「${sourceCard.title}」中截至分支点的对话，共 ${turnCount} 轮]\n\n${lines.join('\n\n')}`

  return {
    sourceCardId: sourceCard.id,
    sourceCardTitle: sourceCard.title,
    fromMessageId,
    inheritedTurnCount: turnCount,
    text
  }
}
