import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import {
  generateClusterSummary,
  parseClusterSummary,
  sanitizeTitle
} from '@main/llm/clusterSummaryService'
import { createNodeRepository } from '@main/db/repositories/nodes'
import { createProjectRepository } from '@main/db/repositories/projects'
import { createClusterFromSelection } from '@main/topics/clusterService'
import { createTestDatabase } from '../helpers'

let handle: DatabaseHandle

beforeEach(() => {
  handle = createTestDatabase()
})

afterEach(() => {
  handle.sqlite.close()
})

const profile = { baseUrl: 'http://localhost:1/v1', model: 'test-model', temperature: 0.7 }

describe('主题摘要服务', () => {
  it('解析标题与摘要输出并清洗', () => {
    const parsed = parseClusterSummary('标题：「Rust 所有权」\n\n摘要：讨论了所有权与借用。')
    expect(parsed.title).toBe('Rust 所有权')
    expect(parsed.summary).toBe('讨论了所有权与借用。')

    const fallback = parseClusterSummary('内存管理入门\n讲解了栈与堆的区别。')
    expect(fallback.title).toBe('内存管理入门')
    expect(fallback.summary).toContain('栈与堆')

    expect(sanitizeTitle('《标题》')).toBe('标题')
  })

  it('生成主题标题与摘要并写回', async () => {
    const projects = createProjectRepository(handle.db)
    const nodes = createNodeRepository(handle.db)
    const project = projects.create({ name: 'P' })
    const root = nodes.create({ projectId: project.id, parentId: null, userContent: '问题一' })
    nodes.completeAssistant(root.id, '回答一', 'mock')
    const child = nodes.create({
      projectId: project.id,
      parentId: root.id,
      userContent: '问题二'
    })
    nodes.completeAssistant(child.id, '回答二', 'mock')
    const { cluster } = createClusterFromSelection(handle.db, {
      projectId: project.id,
      nodeIds: [root.id, child.id]
    })

    const completeFn = vi.fn(async () => '标题：内存管理\n\n摘要：讨论了内存管理的基础。')
    const updated = await generateClusterSummary({
      db: handle.db,
      clusterId: cluster.id,
      profile,
      completeFn
    })

    expect(updated?.title).toBe('内存管理')
    expect(updated?.summary).toContain('内存管理的基础')
    expect(updated?.titleGenerated).toBe(true)
  })

  it('空主题返回 null', async () => {
    const projects = createProjectRepository(handle.db)
    const project = projects.create({ name: 'P' })
    void project
    const result = await generateClusterSummary({
      db: handle.db,
      clusterId: 'missing',
      profile,
      completeFn: vi.fn()
    })
    expect(result).toBeNull()
  })
})
