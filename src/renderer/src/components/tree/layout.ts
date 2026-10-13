import { hierarchy, tree } from 'd3-hierarchy'
import type { ClusterWithMembers, NodeMeta, TreeAspectId } from '@shared/types'

export const TREE_NODE_BASE_WIDTH = 160
export const TREE_GAP_X = 32
export const TREE_GAP_Y = 56

export const TREE_ASPECT_RATIOS: Record<TreeAspectId, number> = {
  '4:1': 4,
  '3:1': 3,
  '2:1': 2,
  '1:1': 1
}

export function resolveNodeSize(aspect: TreeAspectId): { width: number; height: number } {
  const width = TREE_NODE_BASE_WIDTH
  const ratio = TREE_ASPECT_RATIOS[aspect] ?? 3
  return { width, height: Math.round(width / ratio) }
}

export const CLUSTER_PREFIX = 'cluster:'

export function isClusterVNodeId(id: string): boolean {
  return id.startsWith(CLUSTER_PREFIX)
}

export interface VisibleTreeNode {
  id: string
  kind: 'node' | 'cluster'
  label: string
  depth: number
  x: number
  y: number
  width?: number
  height?: number
  isGroupBox?: boolean
  meta?: NodeMeta
  cluster?: ClusterWithMembers
  childCount: number
  isMainBranch: boolean
  isArchived: boolean
  isCollapsed: boolean
  isRegenerated: boolean
  versionLabel: string | null
  summarizing?: boolean
}

export interface VisibleTreeEdge {
  id: string
  source: string
  target: string
  isMain: boolean
  isRegenerated: boolean
}

export interface VisibleTreeResult {
  nodes: VisibleTreeNode[]
  edges: VisibleTreeEdge[]
  vnodeIdByNodeId: Record<string, string>
  roots: string[]
}

export interface BuildVisibleTreeInput {
  nodes: NodeMeta[]
  clusters: ClusterWithMembers[]
  membership: Record<string, string>
}

export function buildVisibleTree(
  input: BuildVisibleTreeInput,
  options: { nodeWidth: number; nodeHeight: number; gapX?: number; gapY?: number }
): VisibleTreeResult {
  const gapX = options.gapX ?? TREE_GAP_X
  const gapY = options.gapY ?? TREE_GAP_Y

  const byId = new Map(input.nodes.map((node) => [node.id, node]))
  const clusterById = new Map(input.clusters.map((cluster) => [cluster.id, cluster]))

  const isHidden = (node: NodeMeta): boolean => {
    if (node.deletedAt) return true
    let current = node.parentId ? byId.get(node.parentId) : undefined
    let guard = 0
    while (current && guard < 1000) {
      if (current.deletedAt || current.isArchived || current.isCollapsed) return true
      current = current.parentId ? byId.get(current.parentId) : undefined
      guard += 1
    }
    return false
  }

  const hidden = new Set<string>()
  for (const node of input.nodes) {
    if (isHidden(node)) hidden.add(node.id)
  }
  const alive = input.nodes.filter((node) => !hidden.has(node.id))

  const clusterEntry = (cluster: ClusterWithMembers): string | undefined => {
    let best: NodeMeta | undefined
    const depth = (node: NodeMeta): number => {
      let value = 0
      let current = node
      let guard = 0
      while (current.parentId && byId.get(current.parentId) && guard < 1000) {
        value += 1
        current = byId.get(current.parentId)!
        guard += 1
      }
      return value
    }
    for (const nodeId of cluster.nodeIds) {
      const node = byId.get(nodeId)
      if (!node || hidden.has(nodeId)) continue
      if (
        !best ||
        depth(node) < depth(best) ||
        (depth(node) === depth(best) && node.sortOrder < best.sortOrder)
      ) {
        best = node
      }
    }
    return best?.id
  }

  const groupCounts = new Map<string, number>()
  for (const node of alive) {
    if (!node.turnGroupId) continue
    groupCounts.set(node.turnGroupId, (groupCounts.get(node.turnGroupId) ?? 0) + 1)
  }
  const groupOrder = new Map<string, string[]>()
  for (const node of alive.slice().sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!node.turnGroupId) continue
    const list = groupOrder.get(node.turnGroupId) ?? []
    list.push(node.id)
    groupOrder.set(node.turnGroupId, list)
  }

  const vnodes = new Map<string, VisibleTreeNode>()
  const vnodeParent = new Map<string, string | null>()
  const vnodeIdByNodeId: Record<string, string> = {}
  const entryCreated = new Set<string>()

  const depthOf = (node: NodeMeta): number => {
    let value = 0
    let current = node
    let guard = 0
    while (current.parentId && byId.get(current.parentId) && guard < 1000) {
      value += 1
      current = byId.get(current.parentId)!
      guard += 1
    }
    return value
  }

  const mapParent = (node: NodeMeta): string | null => {
    if (!node.parentId) return null
    const parent = byId.get(node.parentId)
    if (!parent || hidden.has(parent.id)) {
      return parent ? mapParent(parent) : null
    }
    const clusterId = input.membership[parent.id]
    if (clusterId) {
      const cluster = clusterById.get(clusterId)
      if (cluster && cluster.isCollapsed) {
        const entry = clusterEntry(cluster)
        if (entry && entryCreated.has(clusterId)) return `${CLUSTER_PREFIX}${clusterId}`
        if (entry) {
          const entryNode = byId.get(entry)!
          createClusterVNode(cluster, entryNode)
          return `${CLUSTER_PREFIX}${clusterId}`
        }
      }
    }
    return parent.id
  }

  const createClusterVNode = (cluster: ClusterWithMembers, entry: NodeMeta): void => {
    if (entryCreated.has(cluster.id)) return
    entryCreated.add(cluster.id)
    const id = `${CLUSTER_PREFIX}${cluster.id}`
    vnodes.set(id, {
      id,
      kind: 'cluster',
      label: cluster.title,
      depth: depthOf(entry),
      x: 0,
      y: 0,
      cluster,
      childCount: cluster.nodeIds.length,
      isMainBranch: entry.isMainBranch,
      isArchived: false,
      isCollapsed: cluster.isCollapsed,
      isRegenerated: false,
      versionLabel: null
    })
    vnodeParent.set(id, mapParent(entry))
    vnodeIdByNodeId[entry.id] = id
  }

  const ordered = alive
    .filter((node) => !hidden.has(node.id))
    .sort((a, b) => depthOf(a) - depthOf(b) || a.sortOrder - b.sortOrder)

  for (const node of ordered) {
    const clusterId = input.membership[node.id]
    const cluster = clusterId ? clusterById.get(clusterId) : undefined
    if (cluster && cluster.isCollapsed) {
      const entry = clusterEntry(cluster)
      if (entry) vnodeIdByNodeId[node.id] = `${CLUSTER_PREFIX}${cluster.id}`
      if (entry === node.id) createClusterVNode(cluster, node)
      continue
    }

    const groupId = node.turnGroupId
    const count = groupId ? (groupCounts.get(groupId) ?? 1) : 1
    const index = groupId ? (groupOrder.get(groupId)?.indexOf(node.id) ?? 0) : 0
    const childCount = input.nodes.filter(
      (child) => child.parentId === node.id && !child.deletedAt
    ).length
    vnodes.set(node.id, {
      id: node.id,
      kind: 'node',
      label: node.userContent,
      depth: depthOf(node),
      x: 0,
      y: 0,
      meta: node,
      childCount,
      isMainBranch: node.isMainBranch,
      isArchived: node.isArchived,
      isCollapsed: node.isCollapsed,
      isRegenerated: count > 1,
      versionLabel: count > 1 ? `v${index + 1}/${count}` : null
    })
    vnodeParent.set(node.id, mapParent(node))
  }

  const edges: VisibleTreeEdge[] = []
  for (const [id, parentId] of vnodeParent) {
    if (!parentId || !vnodes.has(parentId)) continue
    const vnode = vnodes.get(id)!
    edges.push({
      id: `${parentId}-${id}`,
      source: parentId,
      target: id,
      isMain: vnode.isMainBranch,
      isRegenerated: vnode.isRegenerated
    })
  }

  const roots = [...vnodes.keys()].filter((id) => !vnodeParent.get(id) || !vnodes.has(vnodeParent.get(id)!))

  interface Datum {
    id: string
    children: Datum[]
  }
  const childrenOf = new Map<string, string[]>()
  for (const [id, parentId] of vnodeParent) {
    if (!parentId || !vnodes.has(parentId)) continue
    const list = childrenOf.get(parentId) ?? []
    list.push(id)
    childrenOf.set(parentId, list)
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => {
      const va = vnodes.get(a)!
      const vb = vnodes.get(b)!
      if (va.isMainBranch !== vb.isMainBranch) return va.isMainBranch ? -1 : 1
      const sa = va.meta?.sortOrder ?? 0
      const sb = vb.meta?.sortOrder ?? 0
      return sa - sb
    })
  }

  let xOffset = 0
  for (const rootId of roots) {
    const toDatum = (id: string): Datum => ({
      id,
      children: (childrenOf.get(id) ?? []).map(toDatum)
    })
    const rootDatum = toDatum(rootId)
    const rootNode = hierarchy(rootDatum, (datum) => datum.children)
    tree<Datum>().nodeSize([options.nodeWidth + gapX, options.nodeHeight + gapY])(rootNode)
    const descendants = rootNode.descendants()
    const xs = descendants.map((node) => node.x ?? 0)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    for (const node of descendants) {
      const vnode = vnodes.get(node.data.id)!
      vnode.x = (node.x ?? 0) - minX + xOffset
      vnode.y = node.y ?? 0
    }
    xOffset += maxX - minX + options.nodeWidth + gapX * 2
  }

  for (const cluster of input.clusters) {
    if (cluster.isCollapsed) continue
    const members = cluster.nodeIds
      .map((nodeId) => vnodes.get(vnodeIdByNodeId[nodeId] ?? nodeId))
      .filter((vnode): vnode is VisibleTreeNode => vnode !== undefined && !vnode.isGroupBox)
    const unique = [...new Map(members.map((vnode) => [vnode.id, vnode])).values()]
    if (unique.length < 2) continue
    const minX = Math.min(...unique.map((vnode) => vnode.x))
    const maxX = Math.max(...unique.map((vnode) => vnode.x))
    const minY = Math.min(...unique.map((vnode) => vnode.y))
    const maxY = Math.max(...unique.map((vnode) => vnode.y))
    vnodes.set(`${CLUSTER_PREFIX}${cluster.id}:box`, {
      id: `${CLUSTER_PREFIX}${cluster.id}:box`,
      kind: 'cluster',
      label: cluster.title,
      depth: 0,
      x: minX - 18,
      y: minY - 34,
      width: maxX - minX + options.nodeWidth + 36,
      height: maxY - minY + options.nodeHeight + 52,
      isGroupBox: true,
      cluster,
      childCount: unique.length,
      isMainBranch: false,
      isArchived: false,
      isCollapsed: false,
      isRegenerated: false,
      versionLabel: null
    })
  }

  return { nodes: [...vnodes.values()], edges, vnodeIdByNodeId, roots }
}

export function computeMainPathIds(result: VisibleTreeResult): Set<string> {
  const childrenOf = new Map<string, VisibleTreeNode[]>()
  for (const edge of result.edges) {
    const child = result.nodes.find((node) => node.id === edge.target)
    if (!child) continue
    const list = childrenOf.get(edge.source) ?? []
    list.push(child)
    childrenOf.set(edge.source, list)
  }
  const mainIds = new Set<string>()
  const visit = (id: string) => {
    if (mainIds.has(id)) return
    mainIds.add(id)
    const children = childrenOf.get(id) ?? []
    const mainChild = children.find((child) => child.isMainBranch)
    if (mainChild) visit(mainChild.id)
  }
  for (const rootId of result.roots) visit(rootId)
  return mainIds
}
