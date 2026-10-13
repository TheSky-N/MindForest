import { eq } from 'drizzle-orm'
import type { CardSummary } from '@shared/types'
import type { AppDatabase } from '../client'
import { cardSummaries } from '../schema'

export function createSummaryRepository(db: AppDatabase) {
  return {
    get(cardId: string): CardSummary | undefined {
      return db.select().from(cardSummaries).where(eq(cardSummaries.cardId, cardId)).get()
    },

    upsert(input: {
      cardId: string
      summarizedMessageCount: number
      summarizedTokenCount: number
      summary: string
    }): CardSummary {
      const updatedAt = new Date()
      db.insert(cardSummaries)
        .values({ ...input, updatedAt })
        .onConflictDoUpdate({
          target: cardSummaries.cardId,
          set: {
            summarizedMessageCount: input.summarizedMessageCount,
            summarizedTokenCount: input.summarizedTokenCount,
            summary: input.summary,
            updatedAt
          }
        })
        .run()
      return { ...input, updatedAt }
    },

    remove(cardId: string): void {
      db.delete(cardSummaries).where(eq(cardSummaries.cardId, cardId)).run()
    }
  }
}

export type SummaryRepository = ReturnType<typeof createSummaryRepository>
