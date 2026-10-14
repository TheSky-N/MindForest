import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { buildPathMarkdown, buildProjectJson } from '@main/export/historyExport'
import { createNodeRepository } from '@main/db/repositories/nodes'
import { createProjectRepository } from '@main/db/repositories/projects'
import { createQuoteRepository } from '@main/db/repositories/quotes'
import { createClusterRepository } from '@main/db/repositories/clusters'
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
  const project = projects.create({ name: '导出测试' })
  const root = nodes.create({
    projectId: project.id,
    parentId: null,
    userContent: '第一问',
    model: 'test-model'
  })
  nodes.completeAssistant(root.id, '第一答', 'test-model', {
    promptTokens: 100,
    completionTokens: 50
  })
  const child = nodes.create({
    projectId: project.id,
    parentId: root.id,
    userContent: '第二问',
    model: 'test-model'
  })
  nodes.completeAssistant(child.id, '第二答', 'test-model')
  createQuoteRepository(handle.db).createMany(child.id, [
    { quotedNodeId: root.id, quoteText: '被引用的片段' }
  ])
  return { projects, nodes, project, root, child }
}

describe('对话历史导出', () => {
  it('Markdown 导出包含轮次、引用、模型与 token', () => {
    const { child } = setup()
    const markdown = buildPathMarkdown(handle.db, child.id)

    expect(markdown).toContain('# 导出测试')
    expect(markdown).toContain('共 2 轮')
    expect(markdown).toContain('## 第 1 轮')
    expect(markdown).toContain('第一问')
    expect(markdown).toContain('第一答')
    expect(markdown).toContain('> 引用：被引用的片段')
    expect(markdown).toContain('**AI（test-model）**')
    expect(markdown).toContain('输入 100 tok · 输出 50 tok')
    expect(markdown).toContain('第二答')
  })

  it('JSON 导出包含项目、节点、主题与引用且排除软删除节点', () => {
    const { nodes, project, root, child } = setup()
    nodes.softDelete(root.id)
    const payload = JSON.parse(buildProjectJson(handle.db, project.id)) as {
      version: number
      project: { id: string; name: string }
      nodes: Array<{ id: string }>
      clusters: unknown[]
      quotes: Array<{ nodeId: string; quoteText: string }>
    }

    expect(payload.version).toBe(1)
    expect(payload.project.name).toBe('导出测试')
    expect(payload.nodes.map((node) => node.id)).toContain(child.id)
    expect(payload.nodes.map((node) => node.id)).not.toContain(root.id)
    expect(payload.quotes).toEqual([
      expect.objectContaining({ nodeId: child.id, quoteText: '被引用的片段' })
    ])
    expect(payload.clusters).toEqual([])
  })

  it('主题信息会包含在 JSON 导出中', () => {
    const { project, root, child } = setup()
    createClusterRepository(handle.db).create({
      projectId: project.id,
      title: '测试主题',
      nodeIds: [root.id, child.id]
    })

    const payload = JSON.parse(buildProjectJson(handle.db, project.id)) as {
      clusters: Array<{ title: string; nodeIds: string[] }>
    }

    expect(payload.clusters[0]?.title).toBe('测试主题')
    expect(payload.clusters[0]?.nodeIds).toHaveLength(2)
  })

  it('节点不存在时抛出错误', () => {
    setup()
    expect(() => buildPathMarkdown(handle.db, 'missing')).toThrow('节点不存在')
  })
})
