import { describe, expect, it } from 'vitest'
import type { ClusterWithMembers, NodeMeta } from '@shared/types'
import {
  buildVisibleTree,
  computeMainPathIds,
  resolveNodeSize,
  CLUSTER_PREFIX
} from '../../src/renderer/src/components/tree/layout'

function meta(partial: Partial<NodeMeta> & { id: string }): NodeMeta {
  return {
    projectId: 'p',
    parentId: null,
    userContent: partial.id,
    assistantStatus: 'complete',
    assistantError: null,
    model: null,
    turnGroupId: null,
    sortOrder: 0,
    isMainBranch: false,
    isArchived: false,
    isCollapsed: false,
    deletedAt: null,
    ...partial
  }
}

function cluster(partial: Partial<ClusterWithMembers> & { id: string; nodeIds: string[] }): ClusterWithMembers {
  return {
    projectId: 'p',
    title: partial.id,
    titleGenerated: true,
    summary: null,
    color: null,
    isCollapsed: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...partial
  }
}

const SIZE = { nodeWidth: 160, nodeHeight: 53 }

function baseTree() {
  return [
    meta({ id: 'root', isMainBranch: true }),
    meta({ id: 'a', parentId: 'root', isMainBranch: true }),
    meta({ id: 'b', parentId: 'root', sortOrder: 1 }),
    meta({ id: 'a1', parentId: 'a', isMainBranch: true })
  ]
}

describe('可见主题对话树（向下）', () => {
  it('基本布局向下展开且主分支子节点排前', () => {
    const result = buildVisibleTree({ nodes: baseTree(), clusters: [], membership: {} }, SIZE)
    const root = result.nodes.find((node) => node.id === 'root')!
    const a = result.nodes.find((node) => node.id === 'a')!
    const b = result.nodes.find((node) => node.id === 'b')!
    const a1 = result.nodes.find((node) => node.id === 'a1')!

    expect(a.y).toBeGreaterThan(root.y)
    expect(a1.y).toBeGreaterThan(a.y)
    expect(a.x).toBeLessThan(b.x)
    expect(result.edges).toHaveLength(3)
  })

  it('折叠节点隐藏其后代但自身可见', () => {
    const nodes = baseTree().map((node) =>
      node.id === 'a' ? { ...node, isCollapsed: true } : node
    )
    const result = buildVisibleTree({ nodes, clusters: [], membership: {} }, SIZE)
    expect(result.nodes.map((node) => node.id).sort()).toEqual(['a', 'b', 'root'])
    expect(result.nodes.find((node) => node.id === 'a')?.childCount).toBe(1)
  })

  it('归档节点自身可见（低透明度）且后代隐藏', () => {
    const nodes = baseTree().map((node) =>
      node.id === 'a' ? { ...node, isArchived: true } : node
    )
    const result = buildVisibleTree({ nodes, clusters: [], membership: {} }, SIZE)
    const a = result.nodes.find((node) => node.id === 'a')!
    expect(a).toBeDefined()
    expect(a.isArchived).toBe(true)
    expect(result.nodes.find((node) => node.id === 'a1')).toBeUndefined()
  })

  it('软删除节点及其后代隐藏', () => {
    const nodes = baseTree().map((node) =>
      node.id === 'a' ? { ...node, deletedAt: new Date() } : node
    )
    const result = buildVisibleTree({ nodes, clusters: [], membership: {} }, SIZE)
    expect(result.nodes.map((node) => node.id).sort()).toEqual(['b', 'root'])
  })

  it('折叠主题时将成员合并为簇节点并重接边', () => {
    const nodes = [
      ...baseTree(),
      meta({ id: 'a2', parentId: 'a1' }),
      meta({ id: 'a3', parentId: 'a2' })
    ]
    const clusters = [cluster({ id: 'cl1', nodeIds: ['a1', 'a2'], title: '内存主题' })]
    const membership = { a1: 'cl1', a2: 'cl1' }
    const result = buildVisibleTree({ nodes, clusters, membership }, SIZE)

    const clusterId = `${CLUSTER_PREFIX}cl1`
    expect(result.nodes.find((node) => node.id === clusterId)).toBeDefined()
    expect(result.nodes.find((node) => node.id === 'a1')).toBeUndefined()
    expect(result.nodes.find((node) => node.id === 'a2')).toBeUndefined()
    expect(result.nodes.find((node) => node.id === 'a3')).toBeDefined()

    const edges = result.edges.map((edge) => `${edge.source}->${edge.target}`).sort()
    expect(edges).toContain(`a->${clusterId}`)
    expect(edges).toContain(`${clusterId}->a3`)
    expect(result.vnodeIdByNodeId.a1).toBe(clusterId)
    expect(result.vnodeIdByNodeId.a2).toBe(clusterId)
  })

  it('展开主题时成员正常显示且以虚线框标识边界', () => {
    const nodes = [
      ...baseTree(),
      meta({ id: 'a2', parentId: 'a1' })
    ]
    const clusters = [
      cluster({ id: 'cl1', nodeIds: ['a1', 'a2'], title: '主题', isCollapsed: false })
    ]
    const membership = { a1: 'cl1', a2: 'cl1' }
    const result = buildVisibleTree({ nodes, clusters, membership }, SIZE)

    expect(result.nodes.find((node) => node.id === `${CLUSTER_PREFIX}cl1`)).toBeUndefined()
    expect(result.nodes.find((node) => node.id === 'a1')).toBeDefined()
    expect(result.nodes.find((node) => node.id === 'a2')).toBeDefined()
    const box = result.nodes.find((node) => node.id === `${CLUSTER_PREFIX}cl1:box`)
    expect(box?.isGroupBox).toBe(true)
    expect(box?.width).toBeGreaterThan(SIZE.nodeWidth)
  })

  it('主路径沿主分支延伸', () => {
    const result = buildVisibleTree({ nodes: baseTree(), clusters: [], membership: {} }, SIZE)
    const mainIds = computeMainPathIds(result)
    expect(mainIds.has('root')).toBe(true)
    expect(mainIds.has('a')).toBe(true)
    expect(mainIds.has('a1')).toBe(true)
    expect(mainIds.has('b')).toBe(false)
  })

  it('比例预设换算节点尺寸', () => {
    expect(resolveNodeSize('4:1')).toEqual({ width: 160, height: 40 })
    expect(resolveNodeSize('1:1')).toEqual({ width: 160, height: 160 })
  })
})
