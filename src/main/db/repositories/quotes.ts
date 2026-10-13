import { asc, eq } from 'drizzle-orm'
import type { MessageQuote, QuoteInput } from '@shared/types'
import type { AppDatabase } from '../client'
import { messageQuotes, messages } from '../schema'
import { newId } from '../ids'

export const MAX_QUOTES_PER_MESSAGE = 5
export const MAX_QUOTE_LENGTH = 2000

export function createQuoteRepository(db: AppDatabase) {
  return {
    createMany(messageId: string, quotes: QuoteInput[]): MessageQuote[] {
      const cleaned = quotes
        .map((quote) => ({
          quotedMessageId: quote.quotedMessageId,
          quoteText: quote.quoteText.trim().slice(0, MAX_QUOTE_LENGTH)
        }))
        .filter((quote) => quote.quoteText.length > 0)
        .slice(0, MAX_QUOTES_PER_MESSAGE)
      if (cleaned.length === 0) return []

      const now = new Date()
      return db.transaction((tx) =>
        cleaned.map((quote) => {
          const row: MessageQuote = {
            id: newId(),
            messageId,
            quotedMessageId: quote.quotedMessageId,
            quoteText: quote.quoteText,
            createdAt: now,
            updatedAt: now
          }
          tx.insert(messageQuotes).values(row).run()
          return row
        })
      )
    },

    listByConversation(conversationId: string): MessageQuote[] {
      return db
        .select({
          id: messageQuotes.id,
          messageId: messageQuotes.messageId,
          quotedMessageId: messageQuotes.quotedMessageId,
          quoteText: messageQuotes.quoteText,
          createdAt: messageQuotes.createdAt,
          updatedAt: messageQuotes.updatedAt
        })
        .from(messageQuotes)
        .innerJoin(messages, eq(messageQuotes.messageId, messages.id))
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messageQuotes.createdAt))
        .all()
    }
  }
}

export type QuoteRepository = ReturnType<typeof createQuoteRepository>
