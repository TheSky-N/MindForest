import { asc, eq, inArray } from 'drizzle-orm'
import type { ClusterWithMembers, TopicCluster } from '@shared/types'
import type { AppDatabase } from '../client'
import { topicClusterNodes, topicClusters } from '../schema'
import { newId } from '../ids'

export function createClusterRepository(db: AppDatabase) {
  const repo = {
    listWithMembers(projectId: string): ClusterWithMembers[] {
      const clusters = db
        .select()
        .from(topicClusters)
        .where(eq(topicClusters.projectId, projectId))
        .orderBy(asc(topicClusters.createdAt))
        .all()
      if (clusters.length === 0) return []
      const members = db
        .select()
        .from(topicClusterNodes)
        .where(
          inArray(
            topicClusterNodes.clusterId,
            clusters.map((cluster) => cluster.id)
          )
        )
        .orderBy(asc(topicClusterNodes.sortOrder))
        .all()
      const byCluster = new Map<string, string[]>()
      for (const member of members) {
        const list = byCluster.get(member.clusterId) ?? []
        list.push(member.nodeId)
        byCluster.set(member.clusterId, list)
      }
      return clusters.map((cluster) => ({
        ...cluster,
        nodeIds: byCluster.get(cluster.id) ?? []
      }))
    },

    getWithMembers(id: string): ClusterWithMembers | undefined {
      const cluster = db.select().from(topicClusters).where(eq(topicClusters.id, id)).get()
      if (!cluster) return undefined
      const nodeIds = db
        .select({ nodeId: topicClusterNodes.nodeId })
        .from(topicClusterNodes)
        .where(eq(topicClusterNodes.clusterId, id))
        .orderBy(asc(topicClusterNodes.sortOrder))
        .all()
        .map((row) => row.nodeId)
      return { ...cluster, nodeIds }
    },

    create(input: {
      projectId: string
      title: string
      nodeIds: string[]
      isCollapsed?: boolean
    }): ClusterWithMembers {
      const now = new Date()
      const cluster: TopicCluster = {
        id: newId(),
        projectId: input.projectId,
        title: input.title.trim() || '新主题',
        titleGenerated: false,
        summary: null,
        color: null,
        isCollapsed: input.isCollapsed ?? true,
        createdAt: now,
        updatedAt: now
      }
      db.transaction((tx) => {
        tx.insert(topicClusters).values(cluster).run()
        input.nodeIds.forEach((nodeId, index) => {
          tx.insert(topicClusterNodes)
            .values({ clusterId: cluster.id, nodeId, sortOrder: index })
            .run()
        })
      })
      return { ...cluster, nodeIds: input.nodeIds }
    },

    rename(id: string, title: string): TopicCluster {
      const trimmed = title.trim()
      if (!trimmed) throw new Error('主题标题不能为空')
      db.update(topicClusters)
        .set({ title: trimmed, titleGenerated: true, updatedAt: new Date() })
        .where(eq(topicClusters.id, id))
        .run()
      const cluster = db.select().from(topicClusters).where(eq(topicClusters.id, id)).get()
      if (!cluster) throw new Error('主题不存在')
      return cluster
    },

    setGenerated(id: string, input: { title: string; summary: string }): TopicCluster {
      db.update(topicClusters)
        .set({
          title: input.title,
          summary: input.summary,
          titleGenerated: true,
          updatedAt: new Date()
        })
        .where(eq(topicClusters.id, id))
        .run()
      const cluster = db.select().from(topicClusters).where(eq(topicClusters.id, id)).get()
      if (!cluster) throw new Error('主题不存在')
      return cluster
    },

    setCollapsed(id: string, collapsed: boolean): void {
      db.update(topicClusters)
        .set({ isCollapsed: collapsed, updatedAt: new Date() })
        .where(eq(topicClusters.id, id))
        .run()
    },

    delete(id: string): void {
      db.delete(topicClusters).where(eq(topicClusters.id, id)).run()
    },

    membershipMap(projectId: string): Record<string, string> {
      const rows = db
        .select({ nodeId: topicClusterNodes.nodeId, clusterId: topicClusterNodes.clusterId })
        .from(topicClusterNodes)
        .innerJoin(topicClusters, eq(topicClusterNodes.clusterId, topicClusters.id))
        .where(eq(topicClusters.projectId, projectId))
        .all()
      const map: Record<string, string> = {}
      for (const row of rows) map[row.nodeId] = row.clusterId
      return map
    },

    findClusterForNode(nodeId: string): TopicCluster | undefined {
      const member = db
        .select()
        .from(topicClusterNodes)
        .where(eq(topicClusterNodes.nodeId, nodeId))
        .get()
      if (!member) return undefined
      return db.select().from(topicClusters).where(eq(topicClusters.id, member.clusterId)).get()
    }
  }
  return repo
}

export type ClusterRepository = ReturnType<typeof createClusterRepository>
