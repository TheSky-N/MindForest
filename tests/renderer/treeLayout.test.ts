import { describe, expect, it } from 'vitest'
import type { Card } from '@shared/types'
import {
  buildCardTreeLayout,
  resolveNodeSize,
  type TreeLayoutOptions
} from '../../src/renderer/src/components/tree/layout'

function card(partial: Partial<Card> & { id: string }): Card {
  return {
    projectId: 'p',
    parentCardId: null,
    kind: 'child',
    branchFromMessageId: null,
    inheritedContext: null,
    title: partial.id,
    titleGenerated: false,
    sortOrder: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...partial
  }
}

const DEFAULT_OPTIONS: TreeLayoutOptions = { nodeWidth: 160, nodeHeight: 53 }

describe('卡片树布局（向下发散）', () => {
  it('子节点位于父节点下方，深度递增', () => {
    const cards = [
      card({ id: 'root', kind: 'root' }),
      card({ id: 'a', parentCardId: 'root', sortOrder: 0 }),
      card({ id: 'a1', parentCardId: 'a', kind: 'branch', sortOrder: 0 }),
      card({ id: 'b', parentCardId: 'root', sortOrder: 1 })
    ]

    const layout = buildCardTreeLayout(cards, DEFAULT_OPTIONS)
    const root = layout.nodes.find((node) => node.id === 'root')!
    const a = layout.nodes.find((node) => node.id === 'a')!
    const b = layout.nodes.find((node) => node.id === 'b')!
    const a1 = layout.nodes.find((node) => node.id === 'a1')!

    expect(a.y).toBeGreaterThan(root.y)
    expect(a1.y).toBeGreaterThan(a.y)
    expect(a.y).toBe(b.y)
    expect(a.x).toBeLessThan(b.x)

    const edges = layout.edges.map((edge) => `${edge.source}->${edge.target}:${edge.kind}`).sort()
    expect(edges).toEqual(['a->a1:branch', 'root->a:child', 'root->b:child'])
  })

  it('自定义节点尺寸会改变节点间距', () => {
    const cards = [
      card({ id: 'root', kind: 'root' }),
      card({ id: 'a', parentCardId: 'root', sortOrder: 0 }),
      card({ id: 'b', parentCardId: 'root', sortOrder: 1 })
    ]

    const compact = buildCardTreeLayout(cards, { nodeWidth: 120, nodeHeight: 40 })
    const roomy = buildCardTreeLayout(cards, { nodeWidth: 220, nodeHeight: 90 })

    const compactGap =
      (compact.nodes.find((node) => node.id === 'b')!.x ?? 0) -
      (compact.nodes.find((node) => node.id === 'a')!.x ?? 0)
    const roomyGap =
      (roomy.nodes.find((node) => node.id === 'b')!.x ?? 0) -
      (roomy.nodes.find((node) => node.id === 'a')!.x ?? 0)
    expect(roomyGap).toBeGreaterThan(compactGap)

    const compactDepth =
      compact.nodes.find((node) => node.id === 'a')!.y -
      compact.nodes.find((node) => node.id === 'root')!.y
    const roomyDepth =
      roomy.nodes.find((node) => node.id === 'a')!.y -
      roomy.nodes.find((node) => node.id === 'root')!.y
    expect(roomyDepth).toBeGreaterThan(compactDepth)
  })

  it('多根横向并排互不重叠', () => {
    const cards = [card({ id: 'r1', kind: 'root' }), card({ id: 'r2', kind: 'root' })]
    const layout = buildCardTreeLayout(cards, DEFAULT_OPTIONS)
    const r1 = layout.nodes.find((node) => node.id === 'r1')!
    const r2 = layout.nodes.find((node) => node.id === 'r2')!
    expect(Math.abs(r1.x - r2.x)).toBeGreaterThanOrEqual(DEFAULT_OPTIONS.nodeWidth)
    expect(r1.y).toBe(r2.y)
  })

  it('比例预设换算节点尺寸', () => {
    expect(resolveNodeSize('4:1')).toEqual({ width: 160, height: 40 })
    expect(resolveNodeSize('1:1')).toEqual({ width: 160, height: 160 })
  })

  it('空列表返回空布局', () => {
    expect(buildCardTreeLayout([], DEFAULT_OPTIONS)).toEqual({ nodes: [], edges: [] })
  })
})
