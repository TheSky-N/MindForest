import { asc, eq, inArray } from 'drizzle-orm'
import type { NodeQuote, QuoteInput } from '@shared/types'
import type { AppDatabase } from '../client'
import { nodeQuotes } from '../schema'
import { newId } from '../ids'

export const MAX_QUOTES_PER_NODE = 5
export const MAX_QUOTE_LENGTH = 2000

export function createQuoteRepository(db: AppDatabase) {
  return {
    createMany(nodeId: string, quotes: QuoteInput[]): NodeQuote[] {
      const cleaned = quotes
        .map((quote) => ({
          quotedNodeId: quote.quotedNodeId,
          quoteText: quote.quoteText.trim().slice(0, MAX_QUOTE_LENGTH)
        }))
        .filter((quote) => quote.quoteText.length > 0)
        .slice(0, MAX_QUOTES_PER_NODE)
      if (cleaned.length === 0) return []

      const now = new Date()
      return db.transaction((tx) =>
        cleaned.map((quote) => {
          const row: NodeQuote = {
            id: newId(),
            nodeId,
            quotedNodeId: quote.quotedNodeId,
            quoteText: quote.quoteText,
            createdAt: now,
            updatedAt: now
          }
          tx.insert(nodeQuotes).values(row).run()
          return row
        })
      )
    },

    listByNodes(nodeIds: string[]): NodeQuote[] {
      if (nodeIds.length === 0) return []
      return db
        .select()
        .from(nodeQuotes)
        .where(inArray(nodeQuotes.nodeId, nodeIds))
        .orderBy(asc(nodeQuotes.createdAt))
        .all()
    },

    listByNode(nodeId: string): NodeQuote[] {
      return db
        .select()
        .from(nodeQuotes)
        .where(eq(nodeQuotes.nodeId, nodeId))
        .orderBy(asc(nodeQuotes.createdAt))
        .all()
    }
  }
}

export type QuoteRepository = ReturnType<typeof createQuoteRepository>
