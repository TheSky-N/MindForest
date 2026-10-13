import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { editUserMessage } from '@main/chat/conversationService'
import { BranchPointProtectedError } from '@main/db/errors'
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

function setup() {
  const projects = createProjectRepository(handle.db)
  const cards = createCardRepository(handle.db)
  const conversations = createConversationRepository(handle.db)
  const messages = createMessageRepository(handle.db)
  const { rootCard } = projects.create({ name: 'P' })
  const conversation = conversations.getByCardOrThrow(rootCard.id)
  return { cards, conversations, messages, rootCard, conversation }
}

function appendTurn(
  messages: ReturnType<typeof createMessageRepository>,
  conversationId: string,
  question: string,
  answer?: string
) {
  const user = messages.appendUser({ conversationId, content: question })
  if (answer !== undefined) {
    const assistant = messages.createAssistant({
      conversationId,
      turnIndex: user.turnIndex
    })
    messages.completeAssistant(assistant.id, answer)
  }
  return user
}

describe('编辑用户消息', () => {
  it('编辑后删除同轮回答与其后所有轮次', () => {
    const { messages, conversation } = setup()
    const first = appendTurn(messages, conversation.id, '第一问', '回答一')
    appendTurn(messages, conversation.id, '第二问', '回答二')
    appendTurn(messages, conversation.id, '第三问')

    const result = editUserMessage(handle.db, {
      messageId: first.id,
      content: '修改后的第一问'
    })

    expect(result.message.content).toBe('修改后的第一问')
    expect(result.branchWarning).toBeNull()
    const remaining = messages.listByConversation(conversation.id)
    expect(remaining.map((message) => `${message.role}:${message.turnIndex}`)).toEqual(['user:1'])
  })

  it('后续轮次包含分支点时阻止编辑', () => {
    const { cards, messages, conversation, rootCard } = setup()
    const first = appendTurn(messages, conversation.id, '第一问', '回答一')
    const second = appendTurn(messages, conversation.id, '第二问')
    cards.createBranch({
      sourceCardId: rootCard.id,
      fromMessageId: second.id,
      inheritedContext: '快照'
    })

    expect(() =>
      editUserMessage(handle.db, { messageId: first.id, content: '修改' })
    ).toThrow(BranchPointProtectedError)
    expect(messages.getOrThrow(first.id).content).toBe('第一问')
  })

  it('编辑的消息自身是分支点时返回警告但允许', () => {
    const { cards, messages, conversation, rootCard } = setup()
    const first = appendTurn(messages, conversation.id, '第一问', '回答一')
    cards.createBranch({
      sourceCardId: rootCard.id,
      fromMessageId: first.id,
      inheritedContext: '快照'
    })

    const result = editUserMessage(handle.db, { messageId: first.id, content: '新内容' })

    expect(result.branchWarning).toContain('分支点')
    expect(messages.getOrThrow(first.id).content).toBe('新内容')
  })

  it('不能编辑 assistant 消息或空内容', () => {
    const { messages, conversation } = setup()
    const first = appendTurn(messages, conversation.id, '第一问', '回答一')
    const assistant = messages
      .listByConversation(conversation.id)
      .find((message) => message.role === 'assistant')

    expect(() =>
      editUserMessage(handle.db, { messageId: assistant!.id, content: 'x' })
    ).toThrow('只能编辑用户消息')
    expect(() => editUserMessage(handle.db, { messageId: first.id, content: '   ' })).toThrow(
      '消息内容不能为空'
    )
  })
})
