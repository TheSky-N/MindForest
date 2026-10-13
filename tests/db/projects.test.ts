import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { createCardRepository } from '@main/db/repositories/cards'
import { createConversationRepository } from '@main/db/repositories/conversations'
import { createMessageRepository } from '@main/db/repositories/messages'
import { createProjectRepository } from '@main/db/repositories/projects'
import { countRows, createTestDatabase } from '../helpers'

let handle: DatabaseHandle

beforeEach(() => {
  handle = createTestDatabase()
})

afterEach(() => {
  handle.sqlite.close()
})

describe('项目仓储', () => {
  it('创建项目时自动生成中心卡片与对话', () => {
    const projects = createProjectRepository(handle.db)
    const cards = createCardRepository(handle.db)
    const conversations = createConversationRepository(handle.db)

    const { project, rootCard } = projects.create({ name: '学习 Rust' })

    expect(project.name).toBe('学习 Rust')
    expect(rootCard.kind).toBe('root')
    expect(rootCard.title).toBe('学习 Rust')
    expect(rootCard.parentCardId).toBeNull()
    expect(cards.listByProject(project.id)).toHaveLength(1)
    expect(conversations.getByCard(rootCard.id)?.cardId).toBe(rootCard.id)
  })

  it('删除项目会级联清理卡片、对话与消息', () => {
    const projects = createProjectRepository(handle.db)
    const conversations = createConversationRepository(handle.db)
    const messages = createMessageRepository(handle.db)

    const { project, rootCard } = projects.create({ name: '临时项目' })
    const conversation = conversations.getByCardOrThrow(rootCard.id)
    messages.appendUser({ conversationId: conversation.id, content: '你好' })

    projects.delete(project.id)

    expect(projects.list()).toHaveLength(0)
    expect(countRows(handle, 'cards')).toBe(0)
    expect(countRows(handle, 'conversations')).toBe(0)
    expect(countRows(handle, 'messages')).toBe(0)
  })

  it('重命名项目', () => {
    const projects = createProjectRepository(handle.db)
    const { project } = projects.create({ name: '旧名字' })

    const renamed = projects.rename(project.id, '新名字')

    expect(renamed.name).toBe('新名字')
    expect(renamed.updatedAt.getTime()).toBeGreaterThanOrEqual(project.updatedAt.getTime())
  })
})
