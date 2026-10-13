import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { TurnNode } from '@shared/types'
import type { AppDatabase } from '../db/client'
import { nodeDigests, nodes } from '../db/schema'
import { createNodeRepository } from '../db/repositories/nodes'

export function editNode(
  db: AppDatabase,
  input: { nodeId: string; content: string; syncGroup?: boolean }
): TurnNode {
  const content = input.content.trim()
  if (!content) throw new Error('消息内容不能为空')
  const nodeRepo = createNodeRepository(db)
  nodeRepo.getOrThrow(input.nodeId)
  const subtreeIds = nodeRepo.collectSubtreeIds(input.nodeId)

  return db.transaction((tx) => {
    const now = new Date()
    const node = tx.select().from(nodes).where(eq(nodes.id, input.nodeId)).get()
    if (!node) throw new Error('节点不存在')

    if (input.syncGroup && node.turnGroupId) {
      tx.update(nodes)
        .set({ userContent: content, updatedAt: now })
        .where(and(eq(nodes.turnGroupId, node.turnGroupId), isNull(nodes.deletedAt)))
        .run()
    } else {
      tx.update(nodes)
        .set({ userContent: content, updatedAt: now })
        .where(eq(nodes.id, node.id))
        .run()
    }

    const children = tx
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(eq(nodes.parentId, node.id), isNull(nodes.deletedAt)))
      .all()
    for (const child of children) {
      tx.update(nodes)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(nodes.id, child.id))
        .run()
    }

    if (subtreeIds.length > 0) {
      tx.delete(nodeDigests).where(inArray(nodeDigests.boundaryNodeId, subtreeIds)).run()
    }

    return tx.select().from(nodes).where(eq(nodes.id, node.id)).get()!
  })
}

export function softDeleteNode(db: AppDatabase, nodeId: string): void {
  const nodeRepo = createNodeRepository(db)
  const node = nodeRepo.getOrThrow(nodeId)
  if (!node.parentId) throw new Error('根节点不能删除')
  const subtreeIds = nodeRepo.collectSubtreeIds(nodeId)
  db.transaction((tx) => {
    const now = new Date()
    tx.update(nodes)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(nodes.id, nodeId))
      .run()
    if (subtreeIds.length > 0) {
      tx.delete(nodeDigests).where(inArray(nodeDigests.boundaryNodeId, subtreeIds)).run()
    }
  })
}

export function restoreNode(db: AppDatabase, nodeId: string): void {
  createNodeRepository(db).restore(nodeId)
}

export function purgeNode(db: AppDatabase, nodeId: string): void {
  createNodeRepository(db).purge(nodeId)
}
