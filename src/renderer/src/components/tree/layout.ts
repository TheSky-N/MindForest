import { hierarchy, tree } from 'd3-hierarchy'
import type { Card, TreeAspectId } from '@shared/types'

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

export interface TreeLayoutNode {
  id: string
  card: Card
  x: number
  y: number
}

export interface TreeLayoutEdge {
  id: string
  source: string
  target: string
  kind: Card['kind']
}

export interface TreeLayoutResult {
  nodes: TreeLayoutNode[]
  edges: TreeLayoutEdge[]
}

export interface TreeLayoutOptions {
  nodeWidth: number
  nodeHeight: number
  gapX?: number
  gapY?: number
}

interface HierarchyDatum {
  card: Card
  children: HierarchyDatum[]
}

export function buildCardTreeLayout(
  cards: Card[],
  options: TreeLayoutOptions
): TreeLayoutResult {
  if (cards.length === 0) return { nodes: [], edges: [] }

  const gapX = options.gapX ?? TREE_GAP_X
  const gapY = options.gapY ?? TREE_GAP_Y

  const byId = new Map(cards.map((card) => [card.id, card]))
  const childrenOf = new Map<string, Card[]>()
  const roots: Card[] = []

  for (const card of cards) {
    if (card.parentCardId && byId.has(card.parentCardId)) {
      const list = childrenOf.get(card.parentCardId) ?? []
      list.push(card)
      childrenOf.set(card.parentCardId, list)
    } else {
      roots.push(card)
    }
  }

  const sortCards = (list: Card[]) =>
    list.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime()
    )

  sortCards(roots)
  const toDatum = (card: Card): HierarchyDatum => ({
    card,
    children: sortCards(childrenOf.get(card.id) ?? []).map(toDatum)
  })

  const nodes: TreeLayoutNode[] = []
  const edges: TreeLayoutEdge[] = []
  let xOffset = 0

  for (const root of roots) {
    const rootNode = hierarchy(toDatum(root), (datum) => datum.children)
    tree<HierarchyDatum>().nodeSize([
      options.nodeWidth + gapX,
      options.nodeHeight + gapY
    ])(rootNode)

    const descendants = rootNode.descendants()
    const xs = descendants.map((node) => node.x ?? 0)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)

    for (const node of descendants) {
      nodes.push({
        id: node.data.card.id,
        card: node.data.card,
        x: (node.x ?? 0) - minX + xOffset,
        y: node.y ?? 0
      })
      if (node.parent) {
        edges.push({
          id: `${node.parent.data.card.id}-${node.data.card.id}`,
          source: node.parent.data.card.id,
          target: node.data.card.id,
          kind: node.data.card.kind
        })
      }
    }

    xOffset += maxX - minX + options.nodeWidth + gapX * 2
  }

  return { nodes, edges }
}
