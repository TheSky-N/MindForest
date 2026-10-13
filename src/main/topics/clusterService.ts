import type { ClusterWithMembers } from '@shared/types'
import type { AppDatabase } from '../db/client'
import { createClusterRepository } from '../db/repositories/clusters'
import { createNodeRepository } from '../db/repositories/nodes'

export interface SelectionClosure {
  nodeIds: string[]
  addedNodeCount: number
}

export function depthOf(db: AppDatabase, projectId: string, nodeId: string): number {
  const metas = createNodeRepository(db).listMetaByProject(projectId)
  const byId = new Map(metas.map((node) => [node.id, node]))
  let depth = 0
  let current = byId.get(nodeId)
  while (current?.parentId) {
    depth += 1
    current = byId.get(current.parentId)
  }
  return depth
}

export function orderClusterMembers(
  db: AppDatabase,
  projectId: string,
  nodeIds: string[]
): string[] {
  const metas = createNodeRepository(db).listMetaByProject(projectId)
  const byId = new Map(metas.map((node) => [node.id, node]))
  const depth = (id: string): number => {
    let value = 0
    let current = byId.get(id)
    while (current?.parentId) {
      value += 1
      current = byId.get(current.parentId)
    }
    return value
  }
  return [...nodeIds].sort(
    (a, b) =>
      depth(a) - depth(b) || (byId.get(a)?.sortOrder ?? 0) - (byId.get(b)?.sortOrder ?? 0)
  )
}

export function closeSelectionOverTree(
  db: AppDatabase,
  projectId: string,
  selectedIds: string[]
): SelectionClosure {
  const metas = createNodeRepository(db)
    .listMetaByProject(projectId)
    .filter((node) => !node.deletedAt)
  const byId = new Map(metas.map((node) => [node.id, node]))
  const selected = [...new Set(selectedIds)].filter((id) => byId.has(id))
  if (selected.length === 0) return { nodeIds: [], addedNodeCount: 0 }

  const ancestorChain = (id: string): string[] => {
    const chain: string[] = []
    let current = byId.get(id)
    while (current) {
      chain.push(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return chain
  }

  const selectedSet = new Set(selected)
  const closure = new Set(selected)
  const tops: string[] = []

  for (const id of selected) {
    const chain = ancestorChain(id)
    let nearest: string | null = null
    for (let index = 1; index < chain.length; index += 1) {
      const ancestor = chain[index]!
      if (selectedSet.has(ancestor)) {
        nearest = ancestor
        break
      }
    }
    if (!nearest) {
      tops.push(id)
      continue
    }
    for (let index = 1; index < chain.length; index += 1) {
      const ancestor = chain[index]!
      if (ancestor === nearest) break
      closure.add(ancestor)
    }
  }

  if (tops.length > 1) {
    const chains = tops.map((id) => ancestorChain(id))
    const firstChain = chains[0]!
    for (const candidate of firstChain) {
      const isAncestorOfAll = chains.every((chain) => chain.includes(candidate))
      if (!isAncestorOfAll) continue
      for (const chain of chains) {
        for (const nodeId of chain) {
          closure.add(nodeId)
          if (nodeId === candidate) break
        }
      }
      break
    }
  }

  return { nodeIds: [...closure], addedNodeCount: closure.size - selected.length }
}

export function createClusterFromSelection(
  db: AppDatabase,
  input: { projectId: string; nodeIds: string[]; title?: string }
): { cluster: ClusterWithMembers; addedNodeCount: number } {
  const closure = closeSelectionOverTree(db, input.projectId, input.nodeIds)
  if (closure.nodeIds.length === 0) throw new Error('请先选择要归入主题的节点')

  const clusters = createClusterRepository(db)
  const membership = clusters.membershipMap(input.projectId)
  const conflicts = closure.nodeIds.filter((id) => membership[id])
  if (conflicts.length > 0) {
    throw new Error(`所选节点中有 ${conflicts.length} 个已属于其他主题，请先调整选择`)
  }

  const ordered = orderClusterMembers(db, input.projectId, closure.nodeIds)
  const cluster = clusters.create({
    projectId: input.projectId,
    title: input.title ?? '新主题',
    nodeIds: ordered
  })
  return { cluster, addedNodeCount: closure.addedNodeCount }
}
