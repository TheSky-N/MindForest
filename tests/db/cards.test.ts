import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
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

describe('卡片仓储', () => {
  it('新建子卡片挂在父卡片下', () => {
    const projects = createProjectRepository(handle.db)
    const cards = createCardRepository(handle.db)
    const { rootCard } = projects.create({ name: 'P' })

    const child = cards.createChild({ parentCardId: rootCard.id })

    expect(child.kind).toBe('child')
    expect(child.parentCardId).toBe(rootCard.id)
    expect(child.projectId).toBe(rootCard.projectId)
    expect(child.title).toBe('新子卡片')
    expect(child.inheritedContext).toBeNull()
  })

  it('新建分支卡片记录分支点与冻结上下文', () => {
    const projects = createProjectRepository(handle.db)
    const cards = createCardRepository(handle.db)
    const conversations = createConversationRepository(handle.db)
    const messages = createMessageRepository(handle.db)
    const { rootCard } = projects.create({ name: 'P' })
    const conversation = conversations.getByCardOrThrow(rootCard.id)

    const user = messages.appendUser({ conversationId: conversation.id, content: '问题一' })
    const branch = cards.createBranch({
      sourceCardId: rootCard.id,
      fromMessageId: user.id,
      inheritedContext: '上下文快照'
    })

    expect(branch.kind).toBe('branch')
    expect(branch.parentCardId).toBe(rootCard.id)
    expect(branch.branchFromMessageId).toBe(user.id)
    expect(branch.inheritedContext).toBe('上下文快照')
    expect(cards.findBranchCardForMessage(user.id)?.id).toBe(branch.id)
  })

  it('同级卡片按创建顺序分配 sortOrder', () => {
    const projects = createProjectRepository(handle.db)
    const cards = createCardRepository(handle.db)
    const { rootCard } = projects.create({ name: 'P' })

    const first = cards.createChild({ parentCardId: rootCard.id })
    const second = cards.createChild({ parentCardId: rootCard.id })

    expect(second.sortOrder).toBe(first.sortOrder + 1)
  })

  it('删除卡片会级联删除后代卡片', () => {
    const projects = createProjectRepository(handle.db)
    const cards = createCardRepository(handle.db)
    const { rootCard } = projects.create({ name: 'P' })

    const childA = cards.createChild({ parentCardId: rootCard.id })
    const childB = cards.createChild({ parentCardId: childA.id })
    const branch = cards.createBranch({
      sourceCardId: childA.id,
      fromMessageId: 'not-exist-message',
      inheritedContext: '快照'
    })

    cards.delete(childA.id)

    const remaining = cards.listByProject(rootCard.projectId)
    expect(remaining.map((card) => card.id)).toEqual([rootCard.id])
    expect(cards.get(childB.id)).toBeUndefined()
    expect(cards.get(branch.id)).toBeUndefined()
  })

  it('中心主题卡片不能删除', () => {
    const projects = createProjectRepository(handle.db)
    const cards = createCardRepository(handle.db)
    const { rootCard } = projects.create({ name: 'P' })

    expect(() => cards.delete(rootCard.id)).toThrow('中心主题卡片不能删除')
  })
})
