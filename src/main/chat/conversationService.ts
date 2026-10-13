import { and, eq, gt, inArray } from 'drizzle-orm'
import type { EditMessageResult } from '@shared/types'
import type { AppDatabase } from '../db/client'
import { cards, messages } from '../db/schema'
import { BranchPointProtectedError } from '../db/errors'

export function editUserMessage(
  db: AppDatabase,
  input: { messageId: string; content: string }
): EditMessageResult {
  const content = input.content.trim()
  if (!content) throw new Error('消息内容不能为空')

  const message = db.select().from(messages).where(eq(messages.id, input.messageId)).get()
  if (!message) throw new Error('消息不存在')
  if (message.role !== 'user') throw new Error('只能编辑用户消息')

  const sameTurnAssistantIds = db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, message.conversationId),
        eq(messages.role, 'assistant'),
        eq(messages.turnIndex, message.turnIndex)
      )
    )
    .all()
    .map((row) => row.id)

  const laterIds = db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, message.conversationId),
        gt(messages.turnIndex, message.turnIndex)
      )
    )
    .all()
    .map((row) => row.id)

  const allDoomed = [...sameTurnAssistantIds, ...laterIds]
  if (allDoomed.length > 0) {
    const protectedCard = db
      .select({ title: cards.title })
      .from(cards)
      .where(inArray(cards.branchFromMessageId, allDoomed))
      .get()
    if (protectedCard) throw new BranchPointProtectedError(protectedCard.title)
  }

  const branchCard = db
    .select({ title: cards.title })
    .from(cards)
    .where(eq(cards.branchFromMessageId, message.id))
    .get()

  db.transaction((tx) => {
    tx.update(messages)
      .set({ content, updatedAt: new Date() })
      .where(eq(messages.id, message.id))
      .run()
    if (allDoomed.length > 0) {
      tx.delete(messages).where(inArray(messages.id, allDoomed)).run()
    }
  })

  const updated = db.select().from(messages).where(eq(messages.id, message.id)).get()
  if (!updated) throw new Error('消息不存在')

  return {
    message: updated,
    branchWarning: branchCard
      ? `该消息是分支卡片「${branchCard.title}」的分支点，已创建的分支不会随之更新`
      : null
  }
}
