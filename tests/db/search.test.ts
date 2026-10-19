import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { createNodeRepository } from '@main/db/repositories/nodes'
import { createProjectRepository } from '@main/db/repositories/projects'
import { createSearchRepository } from '@main/db/repositories/search'
import { createTestDatabase } from '../helpers'

let handle: DatabaseHandle

beforeEach(() => {
  handle = createTestDatabase()
})

afterEach(() => {
  handle.sqlite.close()
})

function seed() {
  const projects = createProjectRepository(handle.db)
  const nodes = createNodeRepository(handle.db)
  const project = projects.create({ name: '算法学习' })
  const root = nodes.create({
    projectId: project.id,
    parentId: null,
    userContent: '为什么递归会导致栈溢出？'
  })
  nodes.completeAssistant(root.id, '递归需要用调用栈保存每一层状态，层数太深就会栈溢出。')
  nodes.setGeneratedTitle(root.id, '递归与栈溢出')
  const child = nodes.create({
    projectId: project.id,
    parentId: root.id,
    userContent: '那迭代呢？'
  })
  nodes.completeAssistant(child.id, '迭代通常不会增长调用栈。')
  return { project, nodes, root, child }
}

describe('全文搜索', () => {
  it('中文关键词可以命中提问、回答与标题', () => {
    seed()
    const search = createSearchRepository(handle.db)

    const byQuestion = search.query({ query: '递归' })
    expect(byQuestion).toHaveLength(1)
    expect(byQuestion[0]?.nodeId).toBeTruthy()
    expect(byQuestion[0]?.snippet).toContain('递归')
    expect(byQuestion[0]?.matchedField).toBe('title')

    const byAnswer = search.query({ query: '调用栈保存' })
    expect(byAnswer).toHaveLength(1)
    expect(byAnswer[0]?.matchedField).toBe('assistant')
  })

  it('FTS5 trigram 支持三字以上中文片段', () => {
    seed()
    const results = createSearchRepository(handle.db).query({ query: '栈溢出' })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0]?.snippet).toContain('栈溢出')
  })

  it('支持按项目过滤并排除已删除节点', () => {
    const { project, nodes, root } = seed()
    const other = createProjectRepository(handle.db).create({ name: '另一个项目' })
    const foreign = nodes.create({
      projectId: other.id,
      parentId: null,
      userContent: '递归在另一个项目里'
    })
    nodes.completeAssistant(foreign.id, '递归回答')
    nodes.softDelete(root.id)

    const search = createSearchRepository(handle.db)
    const inProject = search.query({ query: '递归', projectId: project.id })
    expect(inProject.every((item) => item.projectId === project.id)).toBe(true)
    expect(inProject.some((item) => item.nodeId === root.id)).toBe(false)
    const all = search.query({ query: '递归' })
    expect(all.some((item) => item.projectId === other.id)).toBe(true)
  })
})
