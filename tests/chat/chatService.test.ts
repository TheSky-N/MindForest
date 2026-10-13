import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { createChatService } from '@main/chat/chatService'
import type { StreamChatCompletionFn } from '@main/llm/client'
import { createConversationRepository } from '@main/db/repositories/conversations'
import { createMessageRepository } from '@main/db/repositories/messages'
import { createProjectRepository } from '@main/db/repositories/projects'
import { createQuoteRepository } from '@main/db/repositories/quotes'
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

function setup(streamFn: StreamChatCompletionFn, onTurnSettled?: (cardId: string) => void) {
  const projects = createProjectRepository(handle.db)
  const conversations = createConversationRepository(handle.db)
  const messages = createMessageRepository(handle.db)
  const quotes = createQuoteRepository(handle.db)
  const { rootCard } = projects.create({ name: 'P' })
  const conversation = conversations.getByCardOrThrow(rootCard.id)
  const service = createChatService({ db: handle.db, streamFn, onTurnSettled })
  return { service, conversation, messages, quotes, rootCard }
}

describe('聊天服务', () => {
  it('流式生成后落库为 complete，并触发增量与完成事件', async () => {
    const deltas: string[] = []
    let done!: ChatDoneEvent
    const streamFn: StreamChatCompletionFn = async (options) => {
      options.onDelta?.('你好')
      options.onDelta?.('世界')
      return '你好世界'
    }
    const { service, conversation, messages } = setup(streamFn)

    const result = await service.send({
      conversationId: conversation.id,
      content: '打个招呼',
      profile,
      events: {
        delta: (event) => deltas.push(event.delta),
        done: (event) => {
          done = event
        },
        error: () => {
          throw new Error('不应触发 error 事件')
        }
      }
    })

    expect(result.userMessage.turnIndex).toBe(1)
    expect(result.assistantMessage.status).toBe('streaming')

    await flush()

    expect(deltas.join('')).toBe('你好世界')
    expect(done.message.status).toBe('complete')
    const stored = messages.getOrThrow(result.assistantMessage.id)
    expect(stored.status).toBe('complete')
    expect(stored.content).toBe('你好世界')
    expect(stored.model).toBe('test-model')
  })

  it('发送时持久化引用并注入上下文', async () => {
    let captured: Array<{ role: string; content: string }> = []
    const streamFn: StreamChatCompletionFn = async (options) => {
      captured = options.messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
      return '好的'
    }
    const { service, conversation, quotes } = setup(streamFn)

    await service.send({
      conversationId: conversation.id,
      content: '请解释这段',
      quotes: [{ quotedMessageId: 'some-message', quoteText: '被引用的内容' }],
      profile,
      events: noopEvents
    })
    await flush()

    const storedQuotes = quotes.listByConversation(conversation.id)
    expect(storedQuotes).toHaveLength(1)
    expect(storedQuotes[0]?.quoteText).toBe('被引用的内容')

    const userMessage = captured.find(
      (message) => message.role === 'user' && message.content.includes('请解释这段')
    )
    expect(userMessage?.content).toContain('被引用的内容')
  })

  it('重新生成新增激活变体，上下文排除该轮旧回答与后续轮次', async () => {
    const contexts: Array<Array<{ role: string; content: string }>> = []
    let call = 0
    const streamFn: StreamChatCompletionFn = async (options) => {
      contexts.push(
        options.messages.map((message) => ({ role: message.role, content: message.content }))
      )
      call += 1
      return `回答${call}`
    }
    const { service, conversation, messages } = setup(streamFn)

    const first = await service.send({
      conversationId: conversation.id,
      content: '第一个问题',
      profile,
      events: noopEvents
    })
    await flush()
    const second = await service.send({
      conversationId: conversation.id,
      content: '第二个问题',
      profile,
      events: noopEvents
    })
    await flush()

    const regenerated = await service.regenerate({
      conversationId: conversation.id,
      turnIndex: 1,
      profile,
      events: noopEvents
    })
    await flush()

    expect(messages.getOrThrow(first.assistantMessage.id).isActiveVariant).toBe(false)
    expect(messages.getOrThrow(second.assistantMessage.id).isActiveVariant).toBe(true)
    expect(messages.getOrThrow(regenerated.assistantMessage.id).isActiveVariant).toBe(true)
    expect(messages.listVariants(conversation.id, 1)).toHaveLength(2)

    const regeneratedContext = contexts[contexts.length - 1] ?? []
    const userContents = regeneratedContext
      .filter((message) => message.role === 'user')
      .map((message) => message.content)
    expect(userContents).toEqual(['第一个问题'])
  })

  it('流结束后通知 onTurnSettled 以触发摘要刷新', async () => {
    const settled = vi.fn()
    const streamFn: StreamChatCompletionFn = async () => '回答'
    const { service, conversation, rootCard } = setup(streamFn, settled)

    await service.send({
      conversationId: conversation.id,
      content: '问题',
      profile,
      events: noopEvents
    })
    await flush()

    expect(settled).toHaveBeenCalledWith(rootCard.id)
  })

  it('流式失败时状态为 error 并保留已生成内容', async () => {
    let errorEvent!: ChatErrorEvent
    const streamFn: StreamChatCompletionFn = async (options) => {
      options.onDelta?.('部分内容')
      throw new Error('网络中断')
    }
    const { service, conversation, messages } = setup(streamFn)

    const result = await service.send({
      conversationId: conversation.id,
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

    expect(errorEvent.message.status).toBe('error')
    const stored = messages.getOrThrow(result.assistantMessage.id)
    expect(stored.status).toBe('error')
    expect(stored.content).toBe('部分内容')
    expect(stored.errorMessage).toBe('网络中断')
  })

  it('取消生成后状态为 aborted 并保留部分内容', async () => {
    const streamFn: StreamChatCompletionFn = (options) =>
      new Promise((_resolve, reject) => {
        options.onDelta?.('已生成一半')
        options.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
    const { service, conversation, messages } = setup(streamFn)

    const result = await service.send({
      conversationId: conversation.id,
      content: '问题',
      profile,
      events: noopEvents
    })

    await flush()
    service.cancel(result.requestId)
    await flush()

    const stored = messages.getOrThrow(result.assistantMessage.id)
    expect(stored.status).toBe('aborted')
    expect(stored.content).toBe('已生成一半')
  })

  it('对话不存在时抛出错误', async () => {
    const streamFn: StreamChatCompletionFn = async () => 'x'
    const { service } = setup(streamFn)

    await expect(
      service.send({ conversationId: 'missing', content: '你好', profile, events: noopEvents })
    ).rejects.toThrow('对话不存在')
  })
})
