import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { refreshChainDigest } from '@main/llm/chainSummaryService'
import { DIGEST_RECENT_WINDOW_TURNS } from '@main/llm/contextAssembler'
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

const profile = { baseUrl: 'http://localhost:1/v1', model: 'test-model', temperature: 0.7 }

function setup(turnCount: number) {
  const projects = createProjectRepository(handle.db)
  const nodes = createNodeRepository(handle.db)
  const digests = createDigestRepository(handle.db)
  const project = projects.create({ name: 'P' })
  const ids: string[] = []
  let parent: string | null = null
  for (let index = 0; index < turnCount; index += 1) {
    const node = nodes.create({
      projectId: project.id,
      parentId: parent,
      userContent: `第 ${index + 1} 个问题`
    })
    nodes.completeAssistant(node.id, `第 ${index + 1} 个回答`, 'mock')
    ids.push(node.id)
    parent = node.id
  }
  return { nodes, digests, project, ids }
}

describe('链摘要（边界复用）', () => {
  it('轮次不足时跳过', async () => {
    const { ids } = setup(3)
    const outcome = await refreshChainDigest({
      db: handle.db,
      nodeId: ids[ids.length - 1]!,
      profile,
      completeFn: vi.fn()
    })
    expect(outcome).toBe('skipped')
  })

  it('超过阈值后生成摘要并记录边界', async () => {
    const turnCount = DIGEST_RECENT_WINDOW_TURNS + 13
    const { digests, ids } = setup(turnCount)
    const completeFn = vi.fn(async () => '这是链摘要')

    const outcome = await refreshChainDigest({
      db: handle.db,
      nodeId: ids[ids.length - 1]!,
      profile,
      completeFn
    })

    expect(outcome).toBe('updated')
    const boundary = ids[turnCount - 1 - DIGEST_RECENT_WINDOW_TURNS]!
    expect(digests.get(boundary)?.digest).toBe('这是链摘要')
    expect(digests.get(boundary)?.coveredNodeCount).toBe(
      turnCount - DIGEST_RECENT_WINDOW_TURNS
    )
  })

  it('已存在边界摘要时不重复生成', async () => {
    const turnCount = DIGEST_RECENT_WINDOW_TURNS + 13
    const { ids } = setup(turnCount)
    const completeFn = vi.fn(async () => '摘要')

    await refreshChainDigest({ db: handle.db, nodeId: ids[ids.length - 1]!, profile, completeFn })
    const second = await refreshChainDigest({
      db: handle.db,
      nodeId: ids[ids.length - 1]!,
      profile,
      completeFn
    })

    expect(second).toBe('skipped')
    expect(completeFn).toHaveBeenCalledTimes(1)
  })

  it('生成失败不影响已有数据', async () => {
    const turnCount = DIGEST_RECENT_WINDOW_TURNS + 13
    const { digests, ids } = setup(turnCount)
    const failing = vi.fn(async () => {
      throw new Error('模型不可用')
    })

    const outcome = await refreshChainDigest({
      db: handle.db,
      nodeId: ids[ids.length - 1]!,
      profile,
      completeFn: failing
    })

    expect(outcome).toBe('failed')
    const boundary = ids[turnCount - 1 - DIGEST_RECENT_WINDOW_TURNS]!
    expect(digests.get(boundary)).toBeUndefined()
  })
})
