import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { buildBranchContext } from '@main/context/branchContext'
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

describe('分支上下文装配', () => {
  it('包含分支点及之前的对话，排除之后的内容', () => {
    const { messages, conversation, rootCard } = setup()
    const q1 = messages.appendUser({ conversationId: conversation.id, content: '问题一' })
    const a1 = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: q1.turnIndex
    })
    messages.completeAssistant(a1.id, '回答一')
    messages.appendUser({ conversationId: conversation.id, content: '问题二' })

    const context = buildBranchContext(handle.db, {
      sourceCardId: rootCard.id,
      fromMessageId: a1.id
    })

    expect(context.text).toContain('问题一')
    expect(context.text).toContain('回答一')
    expect(context.text).not.toContain('问题二')
    expect(context.inheritedTurnCount).toBe(1)
    expect(context.sourceCardTitle).toBe('P')
  })

  it('跳过未激活的回答变体', () => {
    const { messages, conversation, rootCard } = setup()
    const q1 = messages.appendUser({ conversationId: conversation.id, content: '问题一' })
    const a1 = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: q1.turnIndex
    })
    messages.completeAssistant(a1.id, '旧回答')
    const a2 = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: q1.turnIndex
    })
    messages.completeAssistant(a2.id, '新回答')

    const context = buildBranchContext(handle.db, {
      sourceCardId: rootCard.id,
      fromMessageId: a2.id
    })

    expect(context.text).toContain('新回答')
    expect(context.text).not.toContain('旧回答')
  })

  it('来源卡片自身的继承上下文会前置拼接', () => {
    const { cards, conversations, messages, rootCard, conversation } = setup()
    const q1 = messages.appendUser({ conversationId: conversation.id, content: '问题一' })
    const branch = cards.createBranch({
      sourceCardId: rootCard.id,
      fromMessageId: q1.id,
      inheritedContext: '继承快照'
    })
    const branchConversation = conversations.getByCardOrThrow(branch.id)
    const q2 = messages.appendUser({
      conversationId: branchConversation.id,
      content: '分支问题'
    })

    const context = buildBranchContext(handle.db, {
      sourceCardId: branch.id,
      fromMessageId: q2.id
    })

    expect(context.text.startsWith('继承快照')).toBe(true)
    expect(context.text).toContain('分支问题')
  })

  it('不指定分支点时继承整段对话', () => {
    const { messages, conversation, rootCard } = setup()
    const first = messages.appendUser({ conversationId: conversation.id, content: '问题一' })
    const answerOne = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: first.turnIndex
    })
    messages.completeAssistant(answerOne.id, '回答一')
    const second = messages.appendUser({ conversationId: conversation.id, content: '问题二' })
    const answerTwo = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: second.turnIndex
    })
    messages.completeAssistant(answerTwo.id, '回答二')

    const context = buildBranchContext(handle.db, { sourceCardId: rootCard.id })

    expect(context.fromMessageId).toBeNull()
    expect(context.inheritedTurnCount).toBe(2)
    expect(context.text).toContain('问题一')
    expect(context.text).toContain('回答二')
  })

  it('没有对话时无法建立分支', () => {
    const { rootCard } = setup()

    expect(() => buildBranchContext(handle.db, { sourceCardId: rootCard.id })).toThrow(
      '该卡片还没有对话，无法建立分支'
    )
  })

  it('分支点消息不属于来源卡片时报错', () => {
    const { rootCard } = setup()

    expect(() =>
      buildBranchContext(handle.db, { sourceCardId: rootCard.id, fromMessageId: 'missing' })
    ).toThrow('分支点消息不属于来源卡片')
  })
})
