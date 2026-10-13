import { hierarchy, tree } from 'd3-hierarchy'
import type { Card } from '@shared/types'

export const CARD_NODE_WIDTH = 150
export const CARD_NODE_HEIGHT = 40

const H_GAP = 210
const V_GAP = 64

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

interface HierarchyDatum {
  card: Card
  children: HierarchyDatum[]
}

export function buildCardTreeLayout(cards: Card[]): TreeLayoutResult {
  if (cards.length === 0) return { nodes: [], edges: [] }

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
  let yOffset = 0

  for (const root of roots) {
    const rootNode = hierarchy(toDatum(root), (datum) => datum.children)
    tree<HierarchyDatum>().nodeSize([V_GAP, H_GAP])(rootNode)

    const descendants = rootNode.descendants()
    const xs = descendants.map((node) => node.x ?? 0)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)

    for (const node of descendants) {
      nodes.push({
        id: node.data.card.id,
        card: node.data.card,
        x: node.y ?? 0,
        y: (node.x ?? 0) - minX + yOffset
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

    yOffset += maxX - minX + V_GAP * 2
  }

  return { nodes, edges }
}
