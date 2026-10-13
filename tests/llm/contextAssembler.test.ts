import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { assembleNodeContext } from '@main/llm/contextAssembler'
import { createDigestRepository } from '@main/db/repositories/digests'
import { createNodeRepository } from '@main/db/repositories/nodes'
import { createProjectRepository } from '@main/db/repositories/projects'
import { createQuoteRepository } from '@main/db/repositories/quotes'
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
  const quotes = createQuoteRepository(handle.db)
  const digests = createDigestRepository(handle.db)
  const project = projects.create({ name: '学习项目' })
  return { projects, nodes, quotes, digests, project }
}

function chain(
  nodes: ReturnType<typeof createNodeRepository>,
  projectId: string,
  turns: Array<{ q: string; a?: string }>
): string[] {
  const ids: string[] = []
  let parent: string | null = null
  for (const turn of turns) {
    const node = nodes.create({ projectId, parentId: parent, userContent: turn.q })
    if (turn.a !== undefined) nodes.completeAssistant(node.id, turn.a, 'mock')
    ids.push(node.id)
    parent = node.id
  }
  return ids
}

describe('祖先链上下文装配', () => {
  it('根到目标节点的完整链路（目标自身回答未完成时不入上下文）', () => {
    const { nodes, project } = setup()
    const ids = chain(nodes, project.id, [
      { q: '问题一', a: '回答一' },
      { q: '问题二' }
    ])
    const context = assembleNodeContext(handle.db, ids[1]!)

    expect(context.system).toContain('学习项目')
    const contents = context.messages.map((message) => message.content)
    expect(contents).toEqual(['问题一', '回答一', '问题二'])
  })

  it('引用内容会注入到下一条用户消息', () => {
    const { nodes, quotes, project } = setup()
    const ids = chain(nodes, project.id, [
      { q: '问题一', a: '回答一' },
      { q: '问题二' }
    ])
    quotes.createMany(ids[1]!, [
      { quotedNodeId: ids[0]!, quoteText: '被引用的回答片段' }
    ])

    const context = assembleNodeContext(handle.db, ids[1]!)
    const last = context.messages[context.messages.length - 1]
    expect(last?.content).toContain('被引用的回答片段')
    expect(last?.content).toContain('问题二')
  })

  it('存在摘要边界时使用摘要并只保留边界之后的原始轮次', () => {
    const { nodes, digests, project } = setup()
    const ids = chain(nodes, project.id, [
      { q: '问题一', a: '回答一' },
      { q: '问题二', a: '回答二' },
      { q: '问题三' }
    ])
    digests.upsert({
      boundaryNodeId: ids[0]!,
      digest: '早期对话摘要内容',
      coveredNodeCount: 1,
      coveredTokenCount: 100
    })

    const context = assembleNodeContext(handle.db, ids[2]!)
    expect(context.system).toContain('早期对话摘要内容')
    expect(context.digestBoundaryNodeId).toBe(ids[0])
    const contents = context.messages.map((message) => message.content)
    expect(contents).toEqual(['问题二', '回答二', '问题三'])
  })

  it('超预算时从最旧的消息开始裁剪并保留目标消息', () => {
    const { nodes, project } = setup()
    const ids = chain(nodes, project.id, [
      { q: '问题一'.repeat(30), a: '回答一'.repeat(30) },
      { q: '问题二'.repeat(30), a: '回答二'.repeat(30) },
      { q: '最后一问' }
    ])
    const context = assembleNodeContext(handle.db, ids[2]!, { budget: 120 })

    expect(context.truncated).toBe(true)
    const contents = context.messages.map((message) => message.content)
    expect(contents).not.toContain('问题一'.repeat(30))
    expect(contents[contents.length - 1]).toBe('最后一问')
  })
})
