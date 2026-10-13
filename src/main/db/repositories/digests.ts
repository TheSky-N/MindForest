import { eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { nodeDigests } from '../schema'

export interface DigestRow {
  boundaryNodeId: string
  digest: string
  coveredNodeCount: number
  coveredTokenCount: number
  updatedAt: Date
}

export function createDigestRepository(db: AppDatabase) {
  return {
    get(boundaryNodeId: string): DigestRow | undefined {
      return db.select().from(nodeDigests).where(eq(nodeDigests.boundaryNodeId, boundaryNodeId)).get()
    },

    findDeepestInPath(ancestorIds: string[]): DigestRow | undefined {
      if (ancestorIds.length === 0) return undefined
      const rows = db
        .select()
        .from(nodeDigests)
        .where(inArray(nodeDigests.boundaryNodeId, ancestorIds))
        .all()
      if (rows.length === 0) return undefined
      const order = new Map(ancestorIds.map((id, index) => [id, index]))
      return rows.sort(
        (a, b) => (order.get(b.boundaryNodeId) ?? -1) - (order.get(a.boundaryNodeId) ?? -1)
      )[0]
    },

    upsert(input: {
      boundaryNodeId: string
      digest: string
      coveredNodeCount: number
      coveredTokenCount: number
    }): DigestRow {
      const updatedAt = new Date()
      db.insert(nodeDigests)
        .values({ ...input, updatedAt })
        .onConflictDoUpdate({
          target: nodeDigests.boundaryNodeId,
          set: {
            digest: input.digest,
            coveredNodeCount: input.coveredNodeCount,
            coveredTokenCount: input.coveredTokenCount,
            updatedAt
          }
        })
        .run()
      return { ...input, updatedAt }
    },

    remove(boundaryNodeId: string): void {
      db.delete(nodeDigests).where(eq(nodeDigests.boundaryNodeId, boundaryNodeId)).run()
    }
  }
}

export type DigestRepository = ReturnType<typeof createDigestRepository>
