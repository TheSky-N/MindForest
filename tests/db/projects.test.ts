import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { createNodeRepository } from '@main/db/repositories/nodes'
import { createProjectRepository } from '@main/db/repositories/projects'
import { countRows, createTestDatabase } from '../helpers'

let handle: DatabaseHandle

beforeEach(() => {
  handle = createTestDatabase()
})

afterEach(() => {
  handle.sqlite.close()
})

describe('项目仓储', () => {
  it('创建与列出项目', () => {
    const projects = createProjectRepository(handle.db)
    const project = projects.create({ name: '学习 Rust' })
    expect(projects.list().map((item) => item.id)).toEqual([project.id])
  })

  it('重命名项目', () => {
    const projects = createProjectRepository(handle.db)
    const project = projects.create({ name: '旧名字' })
    expect(projects.rename(project.id, '新名字').name).toBe('新名字')
  })

  it('删除项目级联清理节点、主题与摘要', () => {
    const projects = createProjectRepository(handle.db)
    const nodes = createNodeRepository(handle.db)
    const project = projects.create({ name: 'P' })
    const root = nodes.create({ projectId: project.id, parentId: null, userContent: 'q' })
    nodes.create({ projectId: project.id, parentId: root.id, userContent: 'a' })

    projects.delete(project.id)

    expect(projects.list()).toHaveLength(0)
    expect(countRows(handle, 'nodes')).toBe(0)
    expect(countRows(handle, 'topic_clusters')).toBe(0)
  })
})
