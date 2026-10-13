import { eq } from 'drizzle-orm'
import type { Conversation } from '@shared/types'
import type { AppDatabase } from '../client'
import { conversations } from '../schema'
import { newId } from '../ids'

export function createConversationRepository(db: AppDatabase) {
  const repo = {
    getByCard(cardId: string): Conversation | undefined {
      return db.select().from(conversations).where(eq(conversations.cardId, cardId)).get()
    },

    getById(id: string): Conversation | undefined {
      return db.select().from(conversations).where(eq(conversations.id, id)).get()
    },

    getByCardOrThrow(cardId: string): Conversation {
      const conversation = repo.getByCard(cardId)
      if (!conversation) throw new Error('该卡片还没有对话')
      return conversation
    },

    ensureForCard(cardId: string): Conversation {
      const existing = repo.getByCard(cardId)
      if (existing) return existing
      const now = new Date()
      const conversation: Conversation = {
        id: newId(),
        cardId,
        title: null,
        createdAt: now,
        updatedAt: now
      }
      db.insert(conversations).values(conversation).run()
      return conversation
    },

    rename(id: string, title: string | null): Conversation {
      db.update(conversations)
        .set({ title, updatedAt: new Date() })
        .where(eq(conversations.id, id))
        .run()
      const row = db.select().from(conversations).where(eq(conversations.id, id)).get()
      if (!row) throw new Error('对话不存在')
      return row
    },

    touch(id: string): void {
      db.update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, id))
        .run()
    }
  }
  return repo
}

export type ConversationRepository = ReturnType<typeof createConversationRepository>
