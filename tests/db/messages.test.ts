import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { BranchPointProtectedError } from '@main/db/errors'
import { createCardRepository } from '@main/db/repositories/cards'
import { createConversationRepository } from '@main/db/repositories/conversations'
import { createMessageRepository } from '@main/db/repositories/messages'
import { createProjectRepository } from '@main/db/repositories/projects'
import { createTestDatabase } from '../helpers'
import type { Card } from '@shared/types'

let handle: DatabaseHandle

beforeEach(() => {
  handle = createTestDatabase()
})

afterEach(() => {
  handle.sqlite.close()
})

function setup() {
  const projects = createProjectRepository(handle.db)
  const cards = createCardRepository(handle.db)
  const conversations = createConversationRepository(handle.db)
  const messages = createMessageRepository(handle.db)
  const { rootCard } = projects.create({ name: 'P' })
  const conversation = conversations.getByCardOrThrow(rootCard.id)
  return { cards, conversations, messages, rootCard, conversation }
}

describe('消息仓储', () => {
  it('appendUser 按轮次递增', () => {
    const { messages, conversation } = setup()

    const first = messages.appendUser({ conversationId: conversation.id, content: '第一问' })
    const second = messages.appendUser({ conversationId: conversation.id, content: '第二问' })

    expect(first.turnIndex).toBe(1)
    expect(second.turnIndex).toBe(2)
    expect(messages.listByConversation(conversation.id)).toHaveLength(2)
  })

  it('重新生成产生变体且仅最新变体激活', () => {
    const { messages, conversation } = setup()
    const user = messages.appendUser({ conversationId: conversation.id, content: '问题' })

    const first = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: user.turnIndex
    })
    const second = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: user.turnIndex
    })

    expect(messages.getOrThrow(first.id).isActiveVariant).toBe(false)
    expect(messages.getOrThrow(second.id).isActiveVariant).toBe(true)
    expect(messages.listVariants(conversation.id, user.turnIndex)).toHaveLength(2)

    messages.setActiveVariant(first.id)

    expect(messages.getOrThrow(first.id).isActiveVariant).toBe(true)
    expect(messages.getOrThrow(second.id).isActiveVariant).toBe(false)
  })

  it('状态流转：complete / aborted / error', () => {
    const { messages, conversation } = setup()
    const user = messages.appendUser({ conversationId: conversation.id, content: '问题' })
    const assistant = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: user.turnIndex
    })

    expect(messages.abortAssistant(assistant.id, '部分内容').status).toBe('aborted')
    expect(messages.abortAssistant(assistant.id, '部分内容').content).toBe('部分内容')
    expect(messages.failAssistant(assistant.id, '网络错误').status).toBe('error')
    expect(messages.failAssistant(assistant.id, '网络错误').errorMessage).toBe('网络错误')

    const completed = messages.completeAssistant(assistant.id, '完整回答', 'test-model')
    expect(completed.status).toBe('complete')
    expect(completed.content).toBe('完整回答')
    expect(completed.model).toBe('test-model')
  })

  it('deleteTurn 删除整轮（含全部变体）', () => {
    const { messages, conversation } = setup()
    const user = messages.appendUser({ conversationId: conversation.id, content: '问题' })
    const first = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: user.turnIndex
    })
    const second = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: user.turnIndex
    })

    messages.deleteTurn(conversation.id, user.turnIndex)

    expect(messages.listByConversation(conversation.id)).toHaveLength(0)
    expect(messages.get(first.id)).toBeUndefined()
    expect(messages.get(second.id)).toBeUndefined()
  })

  it('分支点消息受保护，不能删除', () => {
    const { cards, messages, conversation, rootCard } = setup()
    const user = messages.appendUser({ conversationId: conversation.id, content: '问题' })
    cards.createBranch({
      sourceCardId: rootCard.id,
      fromMessageId: user.id,
      inheritedContext: '快照'
    })

    expect(() => messages.deleteTurn(conversation.id, user.turnIndex)).toThrow(
      BranchPointProtectedError
    )
  })

  it('删除中间轮次不影响后续轮次', () => {
    const { messages, conversation } = setup()
    const first = messages.appendUser({ conversationId: conversation.id, content: '第一问' })
    const second = messages.appendUser({ conversationId: conversation.id, content: '第二问' })
    const third = messages.appendUser({ conversationId: conversation.id, content: '第三问' })

    messages.deleteTurn(conversation.id, second.turnIndex)

    const remaining = messages.listByConversation(conversation.id)
    expect(remaining.map((message) => message.turnIndex)).toEqual([
      first.turnIndex,
      third.turnIndex
    ])
  })
})

export type { Card }
