import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { createNodeRepository } from '@main/db/repositories/nodes'
import { createProjectRepository } from '@main/db/repositories/projects'
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
  const { project } = { project: projects.create({ name: 'P' }) }
  return { projects, nodes, project }
}

describe('节点仓储', () => {
  it('创建根节点与子节点，默认主分支为第一个子节点', () => {
    const { nodes, project } = setup()
    const root = nodes.create({
      projectId: project.id,
      parentId: null,
      userContent: '第一问'
    })
    expect(root.isMainBranch).toBe(true)
    expect(root.sortOrder).toBe(0)
    expect(root.assistantStatus).toBe('streaming')

    const first = nodes.create({
      projectId: project.id,
      parentId: root.id,
      userContent: '子问题 A'
    })
    const second = nodes.create({
      projectId: project.id,
      parentId: root.id,
      userContent: '子问题 B'
    })
    expect(first.isMainBranch).toBe(true)
    expect(second.isMainBranch).toBe(false)
    expect(second.sortOrder).toBe(1)
    expect(nodes.getPath(second.id).map((node) => node.id)).toEqual([root.id, second.id])
  })

  it('切换主分支会清除同层其他标记', () => {
    const { nodes, project } = setup()
    const root = nodes.create({ projectId: project.id, parentId: null, userContent: 'root' })
    const first = nodes.create({ projectId: project.id, parentId: root.id, userContent: 'a' })
    const second = nodes.create({ projectId: project.id, parentId: root.id, userContent: 'b' })

    nodes.setMainBranch(second.id)

    expect(nodes.getOrThrow(first.id).isMainBranch).toBe(false)
    expect(nodes.getOrThrow(second.id).isMainBranch).toBe(true)
  })

  it('软删除、恢复与彻底删除', () => {
    const { nodes, project } = setup()
    const root = nodes.create({ projectId: project.id, parentId: null, userContent: 'root' })
    const child = nodes.create({ projectId: project.id, parentId: root.id, userContent: 'child' })
    const grand = nodes.create({ projectId: project.id, parentId: child.id, userContent: 'grand' })

    nodes.softDelete(child.id)
    expect(nodes.getOrThrow(child.id).deletedAt).not.toBeNull()
    expect(nodes.listDeleted(project.id)[0]?.node.id).toBe(child.id)
    expect(nodes.listDeleted(project.id)[0]?.descendantCount).toBe(1)

    nodes.restore(child.id)
    expect(nodes.getOrThrow(child.id).deletedAt).toBeNull()

    nodes.purge(child.id)
    expect(nodes.get(child.id)).toBeUndefined()
    expect(nodes.get(grand.id)).toBeUndefined()
  })

  it('归档与折叠标记独立保存', () => {
    const { nodes, project } = setup()
    const node = nodes.create({ projectId: project.id, parentId: null, userContent: 'x' })
    nodes.setArchived(node.id, true)
    nodes.setCollapsed(node.id, true)
    expect(nodes.getOrThrow(node.id).isArchived).toBe(true)
    expect(nodes.getOrThrow(node.id).isCollapsed).toBe(true)
    nodes.setArchived(node.id, false)
    expect(nodes.getOrThrow(node.id).isCollapsed).toBe(true)
  })

  it('用户消息折叠状态支持自动（null）与显式值', () => {
    const { nodes, project } = setup()
    const node = nodes.create({ projectId: project.id, parentId: null, userContent: 'x' })
    expect(nodes.getOrThrow(node.id).userCollapsed).toBeNull()
    nodes.setUserCollapsed(node.id, true)
    expect(nodes.getOrThrow(node.id).userCollapsed).toBe(true)
    nodes.setUserCollapsed(node.id, false)
    expect(nodes.getOrThrow(node.id).userCollapsed).toBe(false)
    nodes.setUserCollapsed(node.id, null)
    expect(nodes.getOrThrow(node.id).userCollapsed).toBeNull()
  })

  it('同轮分组与遗留 streaming 清理', () => {
    const { nodes, project } = setup()
    const root = nodes.create({ projectId: project.id, parentId: null, userContent: 'q' })
    const sibling = nodes.create({
      projectId: project.id,
      parentId: null,
      userContent: 'q',
      turnGroupId: 'g1',
      isMainBranch: false
    })
    expect(nodes.getTurnGroup('g1').map((node) => node.id)).toEqual([sibling.id])

    const changes = nodes.failStaleStreaming()
    expect(changes).toBeGreaterThanOrEqual(1)
    expect(nodes.getOrThrow(root.id).assistantStatus).toBe('error')
  })
})
