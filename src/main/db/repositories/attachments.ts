import { asc, eq, inArray } from 'drizzle-orm'
import type { Attachment } from '@shared/types'
import type { AppDatabase } from '../client'
import { attachments } from '../schema'
import { newId } from '../ids'
import type { StoredAttachment } from '../../attachments/storage'

export interface CreateAttachmentInput extends StoredAttachment {
  nodeId: string
}

export function createAttachmentRepository(db: AppDatabase) {
  const repo = {
    listByNode(nodeId: string): Attachment[] {
      return db
        .select()
        .from(attachments)
        .where(eq(attachments.nodeId, nodeId))
        .orderBy(asc(attachments.createdAt))
        .all()
        .map(toShared)
    },

    listByNodes(nodeIds: string[]): Attachment[] {
      if (nodeIds.length === 0) return []
      return db
        .select()
        .from(attachments)
        .where(inArray(attachments.nodeId, nodeIds))
        .orderBy(asc(attachments.createdAt))
        .all()
        .map(toShared)
    },

    get(id: string): Attachment | undefined {
      const row = db.select().from(attachments).where(eq(attachments.id, id)).get()
      return row ? toShared(row) : undefined
    },

    getStoragePath(id: string): { storagePath: string; mimeType: string } | undefined {
      const row = db.select().from(attachments).where(eq(attachments.id, id)).get()
      return row ? { storagePath: row.storagePath, mimeType: row.mimeType } : undefined
    },

    createMany(nodeId: string, inputs: StoredAttachment[]): Attachment[] {
      if (inputs.length === 0) return []
      const now = new Date()
      const rows = inputs.map((input) => ({
        id: input.id || newId(),
        nodeId,
        kind: input.kind,
        name: input.name,
        mimeType: input.mimeType,
        size: input.size,
        storagePath: input.storagePath,
        textContent: input.textContent,
        createdAt: now,
        updatedAt: now
      }))
      db.transaction((tx) => {
        for (const row of rows) tx.insert(attachments).values(row).run()
      })
      return rows.map((row) => ({
        id: row.id,
        nodeId: row.nodeId,
        kind: row.kind,
        name: row.name,
        mimeType: row.mimeType,
        size: row.size,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))
    },

    copyToNode(sourceNodeId: string, targetNodeId: string): void {
      const rows = db.select().from(attachments).where(eq(attachments.nodeId, sourceNodeId)).all()
      if (rows.length === 0) return
      const now = new Date()
      db.transaction((tx) => {
        for (const row of rows) {
          tx.insert(attachments)
            .values({ ...row, id: newId(), nodeId: targetNodeId, createdAt: now, updatedAt: now })
            .run()
        }
      })
    },

    listTextByNodes(nodeIds: string[]): Array<{
      nodeId: string
      kind: Attachment['kind']
      name: string
      mimeType: string
      storagePath: string
      textContent: string | null
    }> {
      if (nodeIds.length === 0) return []
      return db
        .select({
          nodeId: attachments.nodeId,
          kind: attachments.kind,
          name: attachments.name,
          mimeType: attachments.mimeType,
          storagePath: attachments.storagePath,
          textContent: attachments.textContent
        })
        .from(attachments)
        .where(inArray(attachments.nodeId, nodeIds))
        .orderBy(asc(attachments.createdAt))
        .all()
    }
  }
  return repo
}

function toShared(row: typeof attachments.$inferSelect): Attachment {
  return {
    id: row.id,
    nodeId: row.nodeId,
    kind: row.kind,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export type AttachmentRepository = ReturnType<typeof createAttachmentRepository>
