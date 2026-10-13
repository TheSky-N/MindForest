import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { assembleCardContext } from '@main/llm/contextAssembler'
import { createCardRepository } from '@main/db/repositories/cards'
import { createConversationRepository } from '@main/db/repositories/conversations'
import { createMessageRepository } from '@main/db/repositories/messages'
import { createProjectRepository } from '@main/db/repositories/projects'
import { createQuoteRepository } from '@main/db/repositories/quotes'
import { createSummaryRepository } from '@main/db/repositories/summaries'
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
  const quotes = createQuoteRepository(handle.db)
  const { project, rootCard } = projects.create({ name: '测试项目' })
  const conversation = conversations.getByCardOrThrow(rootCard.id)
  return { project, cards, conversations, messages, quotes, rootCard, conversation }
}

describe('上下文装配', () => {
  it('根卡片包含主题、项目与历史消息', () => {
    const { messages, conversation, rootCard } = setup()
    messages.appendUser({ conversationId: conversation.id, content: '介绍一下 Rust' })

    const context = assembleCardContext(handle.db, rootCard.id)

    expect(context.system).toContain('测试项目')
    expect(context.system).toContain(rootCard.title)
    expect(context.chatMessages).toHaveLength(1)
    expect(context.chatMessages[0]?.content).toBe('介绍一下 Rust')
    expect(context.truncated).toBe(false)
  })

  it('子卡片背景包含父卡片标题与近期对话节选', () => {
    const { messages, conversation, rootCard, cards } = setup()
    const question = messages.appendUser({
      conversationId: conversation.id,
      content: '父卡片里的重要问题'
    })
    const answer = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: question.turnIndex
    })
    messages.completeAssistant(answer.id, '父卡片里的重要回答')
    const child = cards.createChild({ parentCardId: rootCard.id, title: '深入 Rust 所有权' })

    const context = assembleCardContext(handle.db, child.id)

    expect(context.system).toContain(`父卡片「${rootCard.title}」`)
    expect(context.system).toContain('深入 Rust 所有权')
    expect(context.system).toContain('父卡片里的重要问题')
    expect(context.system).toContain('父卡片里的重要回答')
    expect(context.chatMessages).toHaveLength(0)
  })

  it('存在父卡片摘要时优先使用摘要而非对话节选', () => {
    const { cards, rootCard } = setup()
    const child = cards.createChild({ parentCardId: rootCard.id, title: '子卡片' })
    createSummaryRepository(handle.db).upsert({
      cardId: rootCard.id,
      summarizedMessageCount: 2,
      summarizedTokenCount: 100,
      summary: '这是父卡片摘要'
    })

    const context = assembleCardContext(handle.db, child.id)

    expect(context.system).toContain('这是父卡片摘要')
    expect(context.system).not.toContain('父卡片最近的对话节选')
  })

  it('分支卡片背景包含冻结的继承上下文，自身历史独立', () => {
    const { messages, conversation, rootCard, cards, conversations } = setup()
    const question = messages.appendUser({ conversationId: conversation.id, content: '来源问题' })
    const branch = cards.createBranch({
      sourceCardId: rootCard.id,
      fromMessageId: question.id,
      inheritedContext: '【快照】来源对话内容'
    })
    const branchConversation = conversations.getByCardOrThrow(branch.id)
    messages.appendUser({ conversationId: branchConversation.id, content: '分支里的新问题' })

    const context = assembleCardContext(handle.db, branch.id)

    expect(context.system).toContain('【快照】来源对话内容')
    expect(context.chatMessages).toHaveLength(1)
    expect(context.chatMessages[0]?.content).toBe('分支里的新问题')
  })

  it('仅包含激活的回复变体', () => {
    const { messages, conversation, rootCard } = setup()
    const question = messages.appendUser({ conversationId: conversation.id, content: '问题' })
    const first = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: question.turnIndex
    })
    messages.completeAssistant(first.id, '旧回答')
    const second = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: question.turnIndex
    })
    messages.completeAssistant(second.id, '新回答')

    const context = assembleCardContext(handle.db, rootCard.id)
    const contents = context.chatMessages.map((message) => message.content)

    expect(contents).toContain('新回答')
    expect(contents).not.toContain('旧回答')
  })

  it('用户引用的内容会注入到模型上下文', () => {
    const { messages, quotes, conversation, rootCard } = setup()
    const first = messages.appendUser({ conversationId: conversation.id, content: '第一个问题' })
    const answer = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: first.turnIndex
    })
    messages.completeAssistant(answer.id, '第一段回答')
    const second = messages.appendUser({ conversationId: conversation.id, content: '追问' })
    quotes.createMany(second.id, [
      { quotedMessageId: answer.id, quoteText: '第一段回答的一部分' }
    ])

    const context = assembleCardContext(handle.db, rootCard.id)
    const last = context.chatMessages[context.chatMessages.length - 1]

    expect(last?.content).toContain('第一段回答的一部分')
    expect(last?.content).toContain('追问')
  })

  it('uptoTurnIndex 截断后续轮次，excludeAssistantTurnIndex 排除该轮回答', () => {
    const { messages, conversation, rootCard } = setup()
    const first = messages.appendUser({ conversationId: conversation.id, content: '问题一' })
    const answer = messages.createAssistant({
      conversationId: conversation.id,
      turnIndex: first.turnIndex
    })
    messages.completeAssistant(answer.id, '回答一')
    messages.appendUser({ conversationId: conversation.id, content: '问题二' })

    const context = assembleCardContext(handle.db, rootCard.id, {
      uptoTurnIndex: first.turnIndex,
      excludeAssistantTurnIndex: first.turnIndex
    })
    const contents = context.chatMessages.map((message) => message.content)

    expect(contents).toContain('问题一')
    expect(contents).not.toContain('回答一')
    expect(contents).not.toContain('问题二')
  })

  it('超出预算时从最旧的消息开始截断', () => {
    const { messages, conversation, rootCard } = setup()
    for (let index = 1; index <= 6; index += 1) {
      messages.appendUser({
        conversationId: conversation.id,
        content: `这是第 ${index} 条消息，内容大约二十个汉字`
      })
    }

    const context = assembleCardContext(handle.db, rootCard.id, { budget: 120 })
    const contents = context.chatMessages.map((message) => message.content)

    expect(context.truncated).toBe(true)
    expect(contents).not.toContain('这是第 1 条消息，内容大约二十个汉字')
    expect(contents[contents.length - 1]).toBe('这是第 6 条消息，内容大约二十个汉字')
  })
})
