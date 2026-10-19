import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { createChatService } from '@main/chat/chatService'
import type { ChatMessage, StreamChatCompletionFn } from '@main/llm/client'
import { createAttachmentRepository } from '@main/db/repositories/attachments'
import { createNodeRepository } from '@main/db/repositories/nodes'
import { createProjectRepository } from '@main/db/repositories/projects'
import { createTestDatabase } from '../helpers'
import type { ChatDoneEvent, ChatErrorEvent } from '@shared/types'

let handle: DatabaseHandle

beforeEach(() => {
  handle = createTestDatabase()
})

afterEach(() => {
  handle.sqlite.close()
})

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const profile = {
  baseUrl: 'http://localhost:1/v1',
  model: 'test-model',
  temperature: 0.7,
  apiKey: 'sk-test'
}

const noopEvents = { delta: () => {}, done: () => {}, error: () => {} }

function setup(streamFn: StreamChatCompletionFn, onTurnSettled?: (nodeId: string) => void) {
  const projects = createProjectRepository(handle.db)
  const nodes = createNodeRepository(handle.db)
  const project = projects.create({ name: 'P' })
  const service = createChatService({ db: handle.db, streamFn, onTurnSettled })
  return { projects, nodes, project, service }
}

describe('对话服务（节点模型）', () => {
  it('首条消息创建根节点并流式落库', async () => {
    const streamFn: StreamChatCompletionFn = async (options) => {
      options.onDelta?.('你')
      options.onDelta?.('好')
      return { content: '你好', usage: null }
    }
    const { service, nodes, project } = setup(streamFn)

    const result = await service.send({
      projectId: project.id,
      parentId: null,
      content: '打个招呼',
      profile,
      events: noopEvents
    })

    expect(result.node.parentId).toBeNull()
    expect(result.node.isMainBranch).toBe(true)
    expect(result.node.assistantStatus).toBe('streaming')

    await flush()

    const stored = nodes.getOrThrow(result.node.id)
    expect(stored.assistantStatus).toBe('complete')
    expect(stored.assistantContent).toBe('你好')
    expect(stored.promptTokens).toBeGreaterThan(0)
    expect(stored.completionTokens).toBeGreaterThan(0)
  })

  it('接口返回 usage 时按真实 token 落库', async () => {
    const streamFn: StreamChatCompletionFn = async (options) => {
      options.onDelta?.('回答')
      return { content: '回答', usage: { promptTokens: 123, completionTokens: 45 } }
    }
    const { service, nodes, project } = setup(streamFn)

    const result = await service.send({
      projectId: project.id,
      parentId: null,
      content: '统计 token',
      profile,
      events: noopEvents
    })
    await flush()

    const stored = nodes.getOrThrow(result.node.id)
    expect(stored.promptTokens).toBe(123)
    expect(stored.completionTokens).toBe(45)
  })

  it('从指定节点继续会创建子节点', async () => {
    const streamFn: StreamChatCompletionFn = async () => ({ content: '回答', usage: null })
    const { service, nodes, project } = setup(streamFn)

    const first = await service.send({
      projectId: project.id,
      parentId: null,
      content: '第一问',
      profile,
      events: noopEvents
    })
    await flush()
    const second = await service.send({
      projectId: project.id,
      parentId: first.node.id,
      content: '第二问',
      profile,
      events: noopEvents
    })
    await flush()

    expect(nodes.getPath(second.node.id).map((node) => node.id)).toEqual([
      first.node.id,
      second.node.id
    ])
  })

  it('重新生成会创建同组平行节点', async () => {
    const streamFn: StreamChatCompletionFn = async () => ({ content: '回答', usage: null })
    const { service, nodes, project } = setup(streamFn)

    const first = await service.send({
      projectId: project.id,
      parentId: null,
      content: '问题',
      profile,
      events: noopEvents
    })
    await flush()

    const regenerated = await service.regenerate({
      nodeId: first.node.id,
      profile,
      events: noopEvents
    })
    await flush()

    const source = nodes.getOrThrow(first.node.id)
    const sibling = nodes.getOrThrow(regenerated.node.id)
    expect(sibling.parentId).toBe(source.parentId)
    expect(sibling.userContent).toBe(source.userContent)
    expect(sibling.turnGroupId).toBeTruthy()
    expect(sibling.turnGroupId).toBe(source.turnGroupId)
    expect(source.isMainBranch).toBe(true)
    expect(sibling.isMainBranch).toBe(false)
    expect(nodes.getTurnGroup(source.turnGroupId!)).toHaveLength(2)
  })

  it('取消后保留部分内容并标记 aborted', async () => {
    const streamFn: StreamChatCompletionFn = (options) =>
      new Promise<never>((_resolve, reject) => {
        options.onDelta?.('已生成一半')
        options.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
    const { service, nodes, project } = setup(streamFn)

    const result = await service.send({
      projectId: project.id,
      parentId: null,
      content: '问题',
      profile,
      events: noopEvents
    })
    await flush()
    service.cancel(result.requestId)
    await flush()

    const stored = nodes.getOrThrow(result.node.id)
    expect(stored.assistantStatus).toBe('aborted')
    expect(stored.assistantContent).toBe('已生成一半')
  })

  it('流式失败时状态为 error 并保留部分内容', async () => {
    let errorEvent!: ChatErrorEvent
    const streamFn: StreamChatCompletionFn = async (options) => {
      options.onDelta?.('部分内容')
      throw new Error('网络中断')
    }
    const { service, nodes, project } = setup(streamFn)

    const result = await service.send({
      projectId: project.id,
      parentId: null,
      content: '问题',
      profile,
      events: {
        ...noopEvents,
        error: (event) => {
          errorEvent = event
        }
      }
    })
    await flush()

    expect(errorEvent.node.assistantStatus).toBe('error')
    const stored = nodes.getOrThrow(result.node.id)
    expect(stored.assistantError).toBe('网络中断')
    expect(stored.assistantContent).toBe('部分内容')
  })

  it('流结束通知 onTurnSettled 以触发链摘要', async () => {
    const settled = vi.fn()
    let done!: ChatDoneEvent
    const streamFn: StreamChatCompletionFn = async () => ({ content: '回答', usage: null })
    const { service, project } = setup(streamFn, settled)

    const result = await service.send({
      projectId: project.id,
      parentId: null,
      content: '问题',
      profile,
      events: {
        ...noopEvents,
        done: (event) => {
          done = event
        }
      }
    })
    await flush()

    expect(done.node.assistantStatus).toBe('complete')
    expect(settled).toHaveBeenCalledWith(result.node.id)
  })

  it('父节点不属于该项目时抛出错误', async () => {
    const streamFn: StreamChatCompletionFn = async () => ({ content: '回答', usage: null })
    const { service, project } = setup(streamFn)
    const other = createProjectRepository(handle.db).create({ name: 'Q' })

    await expect(
      service.send({
        projectId: other.id,
        parentId: null,
        content: 'x',
        profile,
        events: noopEvents
      })
    ).resolves.toBeTruthy()

    const foreign = createNodeRepository(handle.db).create({
      projectId: project.id,
      parentId: null,
      userContent: 'foreign'
    })
    await expect(
      service.send({
        projectId: other.id,
        parentId: foreign.id,
        content: 'x',
        profile,
        events: noopEvents
      })
    ).rejects.toThrow('父节点不属于该项目')
  })

  it('保存并流式推送推理内容', async () => {
    let reasoningDelta = ''
    const streamFn: StreamChatCompletionFn = async (options) => {
      options.onReasoningDelta?.('先分析')
      options.onDelta?.('结论')
      return { content: '结论', reasoning: '先分析', usage: null }
    }
    const { service, nodes, project } = setup(streamFn)

    const result = await service.send({
      projectId: project.id,
      parentId: null,
      content: '问题',
      profile,
      events: {
        ...noopEvents,
        delta: (event) => {
          reasoningDelta += event.reasoningDelta ?? ''
        }
      }
    })
    await flush()

    expect(reasoningDelta).toBe('先分析')
    expect(nodes.getOrThrow(result.node.id).assistantReasoning).toBe('先分析')
  })

  it('附件会落库并注入上下文', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mindforest-chat-attachments-'))
    try {
      let captured: ChatMessage[] = []
      const streamFn: StreamChatCompletionFn = async (options) => {
        captured = options.messages
        options.onDelta?.('回答')
        return { content: '回答', usage: null }
      }
      const projects = createProjectRepository(handle.db)
      const project = projects.create({ name: '附件项目' })
      const service = createChatService({
        db: handle.db,
        streamFn,
        attachmentsRoot: root
      })

      const result = await service.send({
        projectId: project.id,
        parentId: null,
        content: '读取附件',
        attachments: [
          {
            kind: 'file',
            name: 'note.txt',
            mimeType: 'text/plain',
            dataBase64: Buffer.from('附件里的内容').toString('base64')
          }
        ],
        profile,
        events: noopEvents
      })
      await flush()

      const stored = createAttachmentRepository(handle.db).listByNode(result.node.id)
      expect(stored).toHaveLength(1)
      expect(stored[0]?.name).toBe('note.txt')
      expect(JSON.stringify(captured)).toContain('附件里的内容')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
