import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { editNode, purgeNode, restoreNode, softDeleteNode } from '@main/chat/nodeService'
import { createDigestRepository } from '@main/db/repositories/digests'
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
  const digests = createDigestRepository(handle.db)
  const project = projects.create({ name: 'P' })
  const root = nodes.create({ projectId: project.id, parentId: null, userContent: '根' })
  const child = nodes.create({ projectId: project.id, parentId: root.id, userContent: '子' })
  const grand = nodes.create({ projectId: project.id, parentId: child.id, userContent: '孙' })
  return { projects, nodes, digests, project, root, child, grand }
}

describe('节点编辑与删除', () => {
  it('编辑消息会软删除其全部子节点并使子树摘要失效', () => {
    const { nodes, digests, child, grand } = setup()
    digests.upsert({
      boundaryNodeId: grand.id,
      digest: '旧摘要',
      coveredNodeCount: 3,
      coveredTokenCount: 100
    })

    const updated = editNode(handle.db, { nodeId: child.id, content: '修改后的子节点' })

    expect(updated.userContent).toBe('修改后的子节点')
    const deletedGrand = nodes.getOrThrow(grand.id)
    expect(deletedGrand.deletedAt).not.toBeNull()
    expect(digests.get(grand.id)).toBeUndefined()
  })

  it('同组同步会更新其他回答版本', () => {
    const { nodes, root } = setup()
    const sibling = nodes.create({
      projectId: root.projectId,
      parentId: null,
      userContent: '根',
      turnGroupId: 'g1',
      isMainBranch: false
    })
    nodes.setTurnGroup(root.id, 'g1')

    editNode(handle.db, { nodeId: root.id, content: '统一后的内容', syncGroup: true })

    expect(nodes.getOrThrow(root.id).userContent).toBe('统一后的内容')
    expect(nodes.getOrThrow(sibling.id).userContent).toBe('统一后的内容')
  })

  it('根节点可软删除并进回收站，子节点可恢复与彻底删除', () => {
    const { nodes, root, child, grand } = setup()

    softDeleteNode(handle.db, root.id)
    expect(nodes.getOrThrow(root.id).deletedAt).not.toBeNull()
    expect(nodes.countByProject(root.projectId)).toBe(3)

    restoreNode(handle.db, root.id)
    expect(nodes.getOrThrow(root.id).deletedAt).toBeNull()

    softDeleteNode(handle.db, child.id)
    expect(nodes.getOrThrow(child.id).deletedAt).not.toBeNull()

    restoreNode(handle.db, child.id)
    expect(nodes.getOrThrow(child.id).deletedAt).toBeNull()

    purgeNode(handle.db, child.id)
    expect(nodes.get(child.id)).toBeUndefined()
    expect(nodes.get(grand.id)).toBeUndefined()
  })

  it('可删除首轮重答产生的平行根节点', () => {
    const { nodes, root } = setup()
    const regenerated = nodes.create({
      projectId: root.projectId,
      parentId: null,
      userContent: root.userContent,
      turnGroupId: 'g-first',
      isMainBranch: false
    })
    nodes.setTurnGroup(root.id, 'g-first')

    softDeleteNode(handle.db, regenerated.id)

    expect(nodes.getOrThrow(regenerated.id).deletedAt).not.toBeNull()
    expect(nodes.getOrThrow(root.id).deletedAt).toBeNull()
    const deleted = nodes.listDeleted(root.projectId)
    expect(deleted.map((item) => item.node.id)).toContain(regenerated.id)
  })
})
