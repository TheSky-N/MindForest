import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { DeletedNodeInfo, NodeMeta, TurnNode } from '@shared/types'
import type { AppDatabase } from '../client'
import { nodes } from '../schema'
import { newId } from '../ids'

export interface CreateNodeInput {
  projectId: string
  parentId: string | null
  userContent: string
  model?: string | null
  turnGroupId?: string | null
  isMainBranch?: boolean
}

export function createNodeRepository(db: AppDatabase) {
  const repo = {
    get(id: string): TurnNode | undefined {
      return db.select().from(nodes).where(eq(nodes.id, id)).get()
    },

    getOrThrow(id: string): TurnNode {
      const node = repo.get(id)
      if (!node) throw new Error('节点不存在')
      return node
    },

    listByProject(projectId: string): TurnNode[] {
      return db
        .select()
        .from(nodes)
        .where(eq(nodes.projectId, projectId))
        .orderBy(asc(nodes.createdAt))
        .all()
    },

    listMetaByProject(projectId: string): NodeMeta[] {
      return db
        .select({
          id: nodes.id,
          projectId: nodes.projectId,
          parentId: nodes.parentId,
          userContent: nodes.userContent,
          assistantStatus: nodes.assistantStatus,
          assistantError: nodes.assistantError,
          model: nodes.model,
          turnGroupId: nodes.turnGroupId,
          sortOrder: nodes.sortOrder,
          isMainBranch: nodes.isMainBranch,
          isArchived: nodes.isArchived,
          isCollapsed: nodes.isCollapsed,
          deletedAt: nodes.deletedAt
        })
        .from(nodes)
        .where(eq(nodes.projectId, projectId))
        .orderBy(asc(nodes.createdAt))
        .all()
    },

    getPath(nodeId: string): TurnNode[] {
      const path: TurnNode[] = []
      let current = repo.get(nodeId)
      while (current) {
        path.unshift(current)
        current = current.parentId ? repo.get(current.parentId) : undefined
      }
      return path
    },

    countChildren(parentId: string): number {
      const row = db
        .select({ value: sql<number>`count(*)` })
        .from(nodes)
        .where(and(eq(nodes.parentId, parentId), isNull(nodes.deletedAt)))
        .get()
      return row?.value ?? 0
    },

    nextSortOrder(parentId: string): number {
      const row = db
        .select({ value: sql<number | null>`max(${nodes.sortOrder})` })
        .from(nodes)
        .where(eq(nodes.parentId, parentId))
        .get()
      return (row?.value ?? -1) + 1
    },

    create(input: CreateNodeInput): TurnNode {
      const parent = input.parentId ? repo.getOrThrow(input.parentId) : null
      const projectId = parent ? parent.projectId : input.projectId
      const isMainBranch =
        input.isMainBranch ?? (parent ? repo.countChildren(parent.id) === 0 : true)
      const sortOrder = parent ? repo.nextSortOrder(parent.id) : 0
      const now = new Date()
      const node: TurnNode = {
        id: newId(),
        projectId,
        parentId: input.parentId,
        userContent: input.userContent,
        assistantContent: '',
        assistantStatus: 'streaming',
        assistantError: null,
        model: input.model ?? null,
        turnGroupId: input.turnGroupId ?? null,
        sortOrder,
        isMainBranch,
        isArchived: false,
        isCollapsed: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      }
      db.insert(nodes).values(node).run()
      return node
    },

    updateUserContent(id: string, content: string): TurnNode {
      db.update(nodes)
        .set({ userContent: content, updatedAt: new Date() })
        .where(eq(nodes.id, id))
        .run()
      return repo.getOrThrow(id)
    },

    setTurnGroup(id: string, groupId: string): void {
      db.update(nodes)
        .set({ turnGroupId: groupId, updatedAt: new Date() })
        .where(eq(nodes.id, id))
        .run()
    },

    completeAssistant(id: string, content: string, model?: string | null): TurnNode {
      const patch: Partial<typeof nodes.$inferInsert> = {
        assistantContent: content,
        assistantStatus: 'complete',
        assistantError: null,
        updatedAt: new Date()
      }
      if (model !== undefined) patch.model = model
      db.update(nodes).set(patch).where(eq(nodes.id, id)).run()
      return repo.getOrThrow(id)
    },

    abortAssistant(id: string, content: string): TurnNode {
      db.update(nodes)
        .set({ assistantContent: content, assistantStatus: 'aborted', updatedAt: new Date() })
        .where(eq(nodes.id, id))
        .run()
      return repo.getOrThrow(id)
    },

    failAssistant(id: string, error: string, content?: string): TurnNode {
      const patch: Partial<typeof nodes.$inferInsert> = {
        assistantStatus: 'error',
        assistantError: error,
        updatedAt: new Date()
      }
      if (content !== undefined) patch.assistantContent = content
      db.update(nodes).set(patch).where(eq(nodes.id, id)).run()
      return repo.getOrThrow(id)
    },

    setMainBranch(id: string): TurnNode {
      const node = repo.getOrThrow(id)
      if (!node.parentId) return node
      return db.transaction((tx) => {
        tx.update(nodes)
          .set({ isMainBranch: false, updatedAt: new Date() })
          .where(eq(nodes.parentId, node.parentId!))
          .run()
        tx.update(nodes)
          .set({ isMainBranch: true, updatedAt: new Date() })
          .where(eq(nodes.id, id))
          .run()
        return { ...node, isMainBranch: true }
      })
    },

    setArchived(id: string, archived: boolean): TurnNode {
      db.update(nodes)
        .set({ isArchived: archived, updatedAt: new Date() })
        .where(eq(nodes.id, id))
        .run()
      return repo.getOrThrow(id)
    },

    setCollapsed(id: string, collapsed: boolean): TurnNode {
      db.update(nodes)
        .set({ isCollapsed: collapsed, updatedAt: new Date() })
        .where(eq(nodes.id, id))
        .run()
      return repo.getOrThrow(id)
    },

    softDelete(id: string): void {
      db.update(nodes)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(nodes.id, id))
        .run()
    },

    restore(id: string): void {
      db.update(nodes)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(eq(nodes.id, id))
        .run()
    },

    purge(id: string): void {
      db.delete(nodes).where(eq(nodes.id, id)).run()
    },

    listDeleted(projectId: string): DeletedNodeInfo[] {
      return db
        .select()
        .from(nodes)
        .where(and(eq(nodes.projectId, projectId), sql`${nodes.deletedAt} is not null`))
        .orderBy(asc(nodes.createdAt))
        .all()
        .map((node) => ({ node, descendantCount: repo.countDescendants(node.id) }))
    },

    countDescendants(id: string): number {
      let count = 0
      const queue = [id]
      while (queue.length > 0) {
        const current = queue.shift()!
        const children = db
          .select({ id: nodes.id })
          .from(nodes)
          .where(eq(nodes.parentId, current))
          .all()
        count += children.length
        for (const child of children) queue.push(child.id)
      }
      return count
    },

    collectSubtreeIds(id: string): string[] {
      const ids: string[] = [id]
      const queue = [id]
      while (queue.length > 0) {
        const current = queue.shift()!
        const children = db
          .select({ id: nodes.id })
          .from(nodes)
          .where(eq(nodes.parentId, current))
          .all()
        for (const child of children) {
          ids.push(child.id)
          queue.push(child.id)
        }
      }
      return ids
    },

    getTurnGroup(groupId: string): TurnNode[] {
      return db
        .select()
        .from(nodes)
        .where(and(eq(nodes.turnGroupId, groupId), isNull(nodes.deletedAt)))
        .orderBy(asc(nodes.sortOrder))
        .all()
    },

    failStaleStreaming(): number {
      const result = db
        .update(nodes)
        .set({
          assistantStatus: 'error',
          assistantError: '应用在生成过程中退出',
          updatedAt: new Date()
        })
        .where(eq(nodes.assistantStatus, 'streaming'))
        .run()
      return result.changes
    },

    listByIds(ids: string[]): TurnNode[] {
      if (ids.length === 0) return []
      return db.select().from(nodes).where(inArray(nodes.id, ids)).all()
    },

    countByProject(projectId: string): number {
      const row = db
        .select({ value: sql<number>`count(*)` })
        .from(nodes)
        .where(eq(nodes.projectId, projectId))
        .get()
      return row?.value ?? 0
    }
  }
  return repo
}

export type NodeRepository = ReturnType<typeof createNodeRepository>
