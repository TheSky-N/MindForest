import { describe, expect, it } from 'vitest'
import type { Card } from '@shared/types'
import { buildCardTreeLayout } from '../../src/renderer/src/components/tree/layout'

function card(partial: Partial<Card> & { id: string }): Card {
  return {
    projectId: 'p',
    parentCardId: null,
    kind: 'child',
    branchFromMessageId: null,
    inheritedContext: null,
    title: partial.id,
    sortOrder: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...partial
  }
}

describe('卡片树布局', () => {
  it('按父子关系与排序生成坐标与边', () => {
    const cards = [
      card({ id: 'root', kind: 'root' }),
      card({ id: 'b', parentCardId: 'root', sortOrder: 1 }),
      card({ id: 'a', parentCardId: 'root', sortOrder: 0 }),
      card({ id: 'a1', parentCardId: 'a', kind: 'branch', sortOrder: 0 })
    ]

    const layout = buildCardTreeLayout(cards)

    expect(layout.nodes).toHaveLength(4)
    const root = layout.nodes.find((node) => node.id === 'root')!
    const a = layout.nodes.find((node) => node.id === 'a')!
    const b = layout.nodes.find((node) => node.id === 'b')!
    const a1 = layout.nodes.find((node) => node.id === 'a1')!

    expect(a.x).toBeGreaterThan(root.x)
    expect(a1.x).toBeGreaterThan(a.x)
    expect(a.y).not.toBe(b.y)

    const edges = layout.edges.map((edge) => `${edge.source}->${edge.target}:${edge.kind}`).sort()
    expect(edges).toEqual(['a->a1:branch', 'root->a:child', 'root->b:child'])
  })

  it('同级卡片按 sortOrder 决定垂直顺序', () => {
    const cards = [
      card({ id: 'root', kind: 'root' }),
      card({ id: 'first', parentCardId: 'root', sortOrder: 0 }),
      card({ id: 'second', parentCardId: 'root', sortOrder: 1 })
    ]

    const layout = buildCardTreeLayout(cards)
    const first = layout.nodes.find((node) => node.id === 'first')!
    const second = layout.nodes.find((node) => node.id === 'second')!

    expect(first.y).toBeLessThan(second.y)
  })

  it('空列表返回空布局', () => {
    expect(buildCardTreeLayout([])).toEqual({ nodes: [], edges: [] })
  })
})
