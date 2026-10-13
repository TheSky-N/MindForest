import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { generateCardTitle, sanitizeTitle } from '@main/llm/titleService'
import { createCardRepository } from '@main/db/repositories/cards'
import { createConversationRepository } from '@main/db/repositories/conversations'
import { createMessageRepository } from '@main/db/repositories/messages'
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

function setup() {
  const projects = createProjectRepository(handle.db)
  const cards = createCardRepository(handle.db)
  const conversations = createConversationRepository(handle.db)
  const messages = createMessageRepository(handle.db)
  const { rootCard } = projects.create({ name: 'P' })
  const conversation = conversations.getByCardOrThrow(rootCard.id)
  return { cards, conversations, messages, rootCard, conversation }
}

describe('AI 标题总结', () => {
  it('清洗模型输出中的引号、换行与结尾标点', () => {
    expect(sanitizeTitle('"Rust 所有权详解。"')).toBe('Rust 所有权详解')
    expect(sanitizeTitle('《内存与借用》')).toBe('内存与借用')
    expect(sanitizeTitle('「生命周期」')).toBe('生命周期')
    expect(sanitizeTitle('  多行\n标题  ')).toBe('多行 标题')
    expect(sanitizeTitle('x'.repeat(50)).length).toBe(24)
  })

  it('生成标题并标记 titleGenerated', async () => {
    const { cards, conversations, messages, rootCard } = setup()
    const child = cards.createChild({ parentCardId: rootCard.id })
    const childConversation = conversations.getByCardOrThrow(child.id)
    const question = messages.appendUser({
      conversationId: childConversation.id,
      content: '请解释 Rust 的所有权'
    })
    const answer = messages.createAssistant({
      conversationId: childConversation.id,
      turnIndex: question.turnIndex
    })
    messages.completeAssistant(answer.id, '所有权是 Rust 的核心概念……')

    type CompleteFn = (options: {
      messages: Array<{ role: string; content: string }>
    }) => Promise<string>
    const completeFn = vi.fn<CompleteFn>(async (options) => {
      void options
      return '「Rust 所有权入门」'
    })
    const updated = await generateCardTitle({
      db: handle.db,
      cardId: child.id,
      profile,
      completeFn
    })

    expect(updated?.title).toBe('Rust 所有权入门')
    expect(updated?.titleGenerated).toBe(true)
    expect(cards.getOrThrow(child.id).title).toBe('Rust 所有权入门')
    const call = completeFn.mock.calls[0]?.[0]
    expect(call?.messages.some((message) => message.content.includes('请解释 Rust 的所有权'))).toBe(true)
  })

  it('卡片没有对话时返回 null', async () => {
    const { cards, rootCard } = setup()
    const child = cards.createChild({ parentCardId: rootCard.id })

    const updated = await generateCardTitle({
      db: handle.db,
      cardId: child.id,
      profile,
      completeFn: vi.fn()
    })

    expect(updated).toBeNull()
  })
})
