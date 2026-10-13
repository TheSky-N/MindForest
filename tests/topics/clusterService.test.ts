import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { createNodeRepository } from '@main/db/repositories/nodes'
import { createProjectRepository } from '@main/db/repositories/projects'
import { closeSelectionOverTree, createClusterFromSelection } from '@main/topics/clusterService'
import { createTestDatabase } from '../helpers'

let handle: DatabaseHandle

beforeEach(() => {
  handle = createTestDatabase()
})

afterEach(() => {
  handle.sqlite.close()
})

function setup() {
  const projects = createProjectRepository(handle.db)
  const nodes = createNodeRepository(handle.db)
  const project = projects.create({ name: 'P' })
  const root = nodes.create({ projectId: project.id, parentId: null, userContent: '根节点' })
  const a = nodes.create({ projectId: project.id, parentId: root.id, userContent: 'a' })
  const b = nodes.create({ projectId: project.id, parentId: a.id, userContent: 'b' })
  const c = nodes.create({ projectId: project.id, parentId: root.id, userContent: 'c' })
  return { projects, nodes, project, root, a, b, c }
}

describe('主题选择闭包', () => {
  it('自动补全选中节点之间的中间节点', () => {
    const { project, a, c } = setup()
    const closure = closeSelectionOverTree(handle.db, project.id, [a.id, c.id])
    expect(closure.addedNodeCount).toBe(1)
    expect(closure.nodeIds.sort()).toEqual(expect.arrayContaining([a.id, c.id]))
  })

  it('跨分支选择会自动补全到公共祖先', () => {
    const { project, root, a, b, c } = setup()
    const closure = closeSelectionOverTree(handle.db, project.id, [b.id, c.id])
    expect(closure.nodeIds.sort()).toEqual(
      [root.id, a.id, b.id, c.id].sort()
    )
    expect(closure.addedNodeCount).toBe(2)
  })

  it('祖先与后代同时选中时会补全中间节点', () => {
    const { project, root, a, b } = setup()
    const closure = closeSelectionOverTree(handle.db, project.id, [root.id, b.id])
    expect(closure.nodeIds.sort()).toEqual([root.id, a.id, b.id].sort())
    expect(closure.addedNodeCount).toBe(1)
  })

  it('链上相邻选择无需补全祖先', () => {
    const { project, a, b } = setup()
    const closure = closeSelectionOverTree(handle.db, project.id, [a.id, b.id])
    expect(closure.nodeIds.sort()).toEqual([a.id, b.id].sort())
    expect(closure.addedNodeCount).toBe(0)
  })

  it('创建主题并拒绝重叠', () => {
    const { project, a, b, c } = setup()
    const created = createClusterFromSelection(handle.db, {
      projectId: project.id,
      nodeIds: [a.id, b.id]
    })
    expect(created.cluster.nodeIds).toEqual([a.id, b.id])
    expect(created.addedNodeCount).toBe(0)

    expect(() =>
      createClusterFromSelection(handle.db, { projectId: project.id, nodeIds: [a.id] })
    ).toThrow('已属于其他主题')

    const other = createClusterFromSelection(handle.db, {
      projectId: project.id,
      nodeIds: [c.id]
    })
    expect(other.cluster.nodeIds).toEqual([c.id])
  })
})
