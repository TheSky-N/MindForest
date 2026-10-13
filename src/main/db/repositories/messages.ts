import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { Message } from '@shared/types'
import type { AppDatabase } from '../client'
import { cards, messages } from '../schema'
import { newId } from '../ids'
import { BranchPointProtectedError } from '../errors'

export function createMessageRepository(db: AppDatabase) {
  const repo = {
    get(id: string): Message | undefined {
      return db.select().from(messages).where(eq(messages.id, id)).get()
    },

    getOrThrow(id: string): Message {
      const message = repo.get(id)
      if (!message) throw new Error('消息不存在')
      return message
    },

    listByConversation(conversationId: string): Message[] {
      return db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.turnIndex), asc(messages.createdAt))
        .all()
    },

    listTurnMessages(conversationId: string, turnIndex: number): Message[] {
      return db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, conversationId), eq(messages.turnIndex, turnIndex)))
        .orderBy(asc(messages.createdAt))
        .all()
    },

    nextTurnIndex(conversationId: string): number {
      const row = db
        .select({ value: sql<number | null>`max(${messages.turnIndex})` })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .get()
      return (row?.value ?? 0) + 1
    },

    appendUser(input: { conversationId: string; content: string }): Message {
      const content = input.content.trim()
      if (!content) throw new Error('消息内容不能为空')
      const now = new Date()
      const message: Message = {
        id: newId(),
        conversationId: input.conversationId,
        turnIndex: repo.nextTurnIndex(input.conversationId),
        role: 'user',
        content,
        status: 'complete',
        model: null,
        errorMessage: null,
        isActiveVariant: true,
        createdAt: now,
        updatedAt: now
      }
      db.insert(messages).values(message).run()
      return message
    },

    createAssistant(input: {
      conversationId: string
      turnIndex: number
      model?: string | null
    }): Message {
      return db.transaction((tx) => {
        tx.update(messages)
          .set({ isActiveVariant: false, updatedAt: new Date() })
          .where(
            and(
              eq(messages.conversationId, input.conversationId),
              eq(messages.turnIndex, input.turnIndex),
              eq(messages.role, 'assistant')
            )
          )
          .run()

        const now = new Date()
        const message: Message = {
          id: newId(),
          conversationId: input.conversationId,
          turnIndex: input.turnIndex,
          role: 'assistant',
          content: '',
          status: 'streaming',
          model: input.model ?? null,
          errorMessage: null,
          isActiveVariant: true,
          createdAt: now,
          updatedAt: now
        }
        tx.insert(messages).values(message).run()
        return message
      })
    },

    setActiveVariant(messageId: string): Message {
      return db.transaction((tx) => {
        const target = tx.select().from(messages).where(eq(messages.id, messageId)).get()
        if (!target) throw new Error('消息不存在')
        tx.update(messages)
          .set({ isActiveVariant: false, updatedAt: new Date() })
          .where(
            and(
              eq(messages.conversationId, target.conversationId),
              eq(messages.turnIndex, target.turnIndex),
              eq(messages.role, 'assistant')
            )
          )
          .run()
        tx.update(messages)
          .set({ isActiveVariant: true, updatedAt: new Date() })
          .where(eq(messages.id, messageId))
          .run()
        return { ...target, isActiveVariant: true }
      })
    },

    listVariants(conversationId: string, turnIndex: number): Message[] {
      return db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.turnIndex, turnIndex),
            eq(messages.role, 'assistant')
          )
        )
        .orderBy(asc(messages.createdAt))
        .all()
    },

    updateContent(id: string, content: string): Message {
      db.update(messages)
        .set({ content, updatedAt: new Date() })
        .where(eq(messages.id, id))
        .run()
      return repo.getOrThrow(id)
    },

    completeAssistant(id: string, content: string, model?: string | null): Message {
      const patch: Partial<typeof messages.$inferInsert> = {
        content,
        status: 'complete',
        updatedAt: new Date()
      }
      if (model !== undefined) patch.model = model
      db.update(messages).set(patch).where(eq(messages.id, id)).run()
      return repo.getOrThrow(id)
    },

    abortAssistant(id: string, content: string): Message {
      db.update(messages)
        .set({ content, status: 'aborted', updatedAt: new Date() })
        .where(eq(messages.id, id))
        .run()
      return repo.getOrThrow(id)
    },

    failAssistant(id: string, errorMessage: string, content?: string): Message {
      const patch: Partial<typeof messages.$inferInsert> = {
        status: 'error',
        errorMessage,
        updatedAt: new Date()
      }
      if (content !== undefined) patch.content = content
      db.update(messages).set(patch).where(eq(messages.id, id)).run()
      return repo.getOrThrow(id)
    },

    failStaleStreaming(): number {
      const result = db
        .update(messages)
        .set({
          status: 'error',
          errorMessage: '应用在生成过程中退出',
          updatedAt: new Date()
        })
        .where(eq(messages.status, 'streaming'))
        .run()
      return result.changes
    },

    deleteTurn(conversationId: string, turnIndex: number): void {
      const turnMessages = repo.listTurnMessages(conversationId, turnIndex)
      if (turnMessages.length === 0) return
      const ids = turnMessages.map((message) => message.id)
      const protectedCard = db
        .select({ title: cards.title })
        .from(cards)
        .where(inArray(cards.branchFromMessageId, ids))
        .get()
      if (protectedCard) throw new BranchPointProtectedError(protectedCard.title)
      db.delete(messages).where(inArray(messages.id, ids)).run()
    }
  }
  return repo
}

export type MessageRepository = ReturnType<typeof createMessageRepository>
