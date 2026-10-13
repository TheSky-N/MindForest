import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { refreshCardSummaryIfNeeded } from '@main/llm/summaryService'
import { createConversationRepository } from '@main/db/repositories/conversations'
import { createMessageRepository } from '@main/db/repositories/messages'
import { createProjectRepository } from '@main/db/repositories/projects'
import { createSummaryRepository } from '@main/db/repositories/summaries'
import { createTestDatabase } from '../helpers'

let handle: DatabaseHandle

beforeEach(() => {
  handle = createTestDatabase()
})

afterEach(() => {
  handle.sqlite.close()
})

const profile = { baseUrl: 'http://localhost:1/v1', model: 'test-model', temperature: 0 }

function setup() {
  const projects = createProjectRepository(handle.db)
  const conversations = createConversationRepository(handle.db)
  const messages = createMessageRepository(handle.db)
  const summaries = createSummaryRepository(handle.db)
  const { rootCard } = projects.create({ name: 'P' })
  const conversation = conversations.getByCardOrThrow(rootCard.id)
  return { conversation, messages, summaries, rootCard }
}

describe('卡片摘要阈值重建', () => {
  it('没有消息时跳过且不调用模型', async () => {
    const { rootCard } = setup()
    const complete = vi.fn(async () => '摘要')

    const outcome = await refreshCardSummaryIfNeeded({
      db: handle.db,
      cardId: rootCard.id,
      profile,
      completeFn: complete
    })

    expect(outcome).toBe('skipped')
    expect(complete).not.toHaveBeenCalled()
  })

  it('新增满 3 条消息后生成摘要并记录基线', async () => {
    const { conversation, messages, summaries, rootCard } = setup()
    const complete = vi.fn(async () => '父卡片摘要内容')
    messages.appendUser({ conversationId: conversation.id, content: '问题一' })
    messages.appendUser({ conversationId: conversation.id, content: '问题二' })
    messages.appendUser({ conversationId: conversation.id, content: '问题三' })

    const outcome = await refreshCardSummaryIfNeeded({
      db: handle.db,
      cardId: rootCard.id,
      profile,
      completeFn: complete
    })

    expect(outcome).toBe('updated')
    expect(complete).toHaveBeenCalledTimes(1)
    const stored = summaries.get(rootCard.id)
    expect(stored?.summary).toBe('父卡片摘要内容')
    expect(stored?.summarizedMessageCount).toBe(3)
    expect(stored?.summarizedTokenCount).toBeGreaterThan(0)
  })

  it('生成后没有新增时不重建', async () => {
    const { conversation, messages, rootCard } = setup()
    const complete = vi.fn(async () => '摘要')
    messages.appendUser({ conversationId: conversation.id, content: '问题一' })
    messages.appendUser({ conversationId: conversation.id, content: '问题二' })
    messages.appendUser({ conversationId: conversation.id, content: '问题三' })

    const first = await refreshCardSummaryIfNeeded({
      db: handle.db,
      cardId: rootCard.id,
      profile,
      completeFn: complete
    })
    const second = await refreshCardSummaryIfNeeded({
      db: handle.db,
      cardId: rootCard.id,
      profile,
      completeFn: complete
    })

    expect(first).toBe('updated')
    expect(second).toBe('skipped')
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('生成失败时保留旧摘要', async () => {
    const { conversation, messages, summaries, rootCard } = setup()
    const success = vi.fn(async () => '旧摘要')
    for (const content of ['问题一', '问题二', '问题三']) {
      messages.appendUser({ conversationId: conversation.id, content })
    }
    await refreshCardSummaryIfNeeded({
      db: handle.db,
      cardId: rootCard.id,
      profile,
      completeFn: success
    })

    const failing = vi.fn(async () => {
      throw new Error('模型不可用')
    })
    for (const content of ['问题四', '问题五', '问题六']) {
      messages.appendUser({ conversationId: conversation.id, content })
    }
    const outcome = await refreshCardSummaryIfNeeded({
      db: handle.db,
      cardId: rootCard.id,
      profile,
      completeFn: failing
    })

    expect(outcome).toBe('failed')
    expect(summaries.get(rootCard.id)?.summary).toBe('旧摘要')
  })
})
