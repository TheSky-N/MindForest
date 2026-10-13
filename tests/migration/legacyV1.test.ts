import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import {
  migrateLegacyData,
  needsLegacyMigration,
  renameLegacyTables
} from '@main/migration/legacyV1'
import { createClusterRepository } from '@main/db/repositories/clusters'
import { createNodeRepository } from '@main/db/repositories/nodes'
import { createQuoteRepository } from '@main/db/repositories/quotes'
import {
  cardSummaries,
  cards,
  conversations,
  messageQuotes,
  messages,
  projects
} from '@main/db/schema'
import { createTestDatabase } from '../helpers'

let handle: DatabaseHandle

beforeEach(() => {
  handle = createTestDatabase()
})

afterEach(() => {
  handle.sqlite.close()
})

function seedLegacy() {
  const now = new Date()
  handle.db.insert(projects).values({ id: 'p1', name: '旧项目', createdAt: now, updatedAt: now }).run()
  handle.db
    .insert(cards)
    .values([
      {
        id: 'c1',
        projectId: 'p1',
        parentCardId: null,
        kind: 'root',
        branchFromMessageId: null,
        inheritedContext: null,
        title: '旧项目',
        titleGenerated: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'c2',
        projectId: 'p1',
        parentCardId: 'c1',
        kind: 'branch',
        branchFromMessageId: 'u2',
        inheritedContext: '继承',
        title: '分支卡',
        titleGenerated: false,
        sortOrder: 0,
        createdAt: new Date(now.getTime() + 1000),
        updatedAt: now
      },
      {
        id: 'c3',
        projectId: 'p1',
        parentCardId: 'c1',
        kind: 'child',
        branchFromMessageId: null,
        inheritedContext: null,
        title: '子卡',
        titleGenerated: true,
        sortOrder: 1,
        createdAt: new Date(now.getTime() + 2000),
        updatedAt: now
      }
    ])
    .run()
  handle.db
    .insert(conversations)
    .values([
      { id: 'conv1', cardId: 'c1', title: null, createdAt: now, updatedAt: now },
      { id: 'conv2', cardId: 'c2', title: null, createdAt: now, updatedAt: now },
      { id: 'conv3', cardId: 'c3', title: null, createdAt: now, updatedAt: now }
    ])
    .run()
  const message = (
    id: string,
    conversationId: string,
    turnIndex: number,
    role: 'user' | 'assistant',
    content: string,
    active = true
  ) => ({
    id,
    conversationId,
    turnIndex,
    role,
    content,
    status: 'complete' as const,
    model: null,
    errorMessage: null,
    isActiveVariant: active,
    createdAt: now,
    updatedAt: now
  })
  handle.db
    .insert(messages)
    .values([
      message('u1', 'conv1', 1, 'user', '问题一'),
      message('a1', 'conv1', 1, 'assistant', '回答一'),
      message('u2', 'conv1', 2, 'user', '问题二'),
      message('a2', 'conv1', 2, 'assistant', '回答二旧', false),
      message('a3', 'conv1', 2, 'assistant', '回答二新', true),
      message('u3', 'conv2', 1, 'user', '分支问题'),
      message('a4', 'conv2', 1, 'assistant', '分支回答'),
      message('u4', 'conv3', 1, 'user', '子卡问题'),
      message('a5', 'conv3', 1, 'assistant', '子卡回答')
    ])
    .run()
  handle.db
    .insert(messageQuotes)
    .values({
      id: 'q1',
      messageId: 'u4',
      quotedMessageId: 'a1',
      quoteText: '引用片段',
      createdAt: now,
      updatedAt: now
    })
    .run()
  handle.db
    .insert(cardSummaries)
    .values({
      cardId: 'c3',
      summarizedMessageCount: 1,
      summarizedTokenCount: 10,
      summary: '子卡摘要',
      updatedAt: now
    })
    .run()
}

describe('v0.1.x 数据迁移', () => {
  it('迁移卡片对话为节点树并保留旧表', () => {
    seedLegacy()
    expect(needsLegacyMigration(handle.db)).toBe(true)

    const report = migrateLegacyData(handle.db, '/tmp/backup.db')
    expect(report.cards).toBe(3)
    expect(report.nodes).toBe(5)
    expect(report.clusters).toBe(2)
    expect(report.backupPath).toBe('/tmp/backup.db')

    const nodes = createNodeRepository(handle.db)
    const all = nodes.listByProject('p1')
    expect(all).toHaveLength(5)

    const rootNode = all.find((node) => node.userContent === '问题一')!
    expect(rootNode.parentId).toBeNull()
    expect(rootNode.assistantContent).toBe('回答一')

    const newAnswer = all.find((node) => node.assistantContent === '回答二新')!
    const oldAnswer = all.find((node) => node.assistantContent === '回答二旧')!
    expect(newAnswer.parentId).toBe(rootNode.id)
    expect(oldAnswer.parentId).toBe(rootNode.id)
    expect(newAnswer.turnGroupId).toBe(oldAnswer.turnGroupId)
    expect(newAnswer.isMainBranch).toBe(true)
    expect(oldAnswer.isMainBranch).toBe(false)

    const branchNode = all.find((node) => node.userContent === '分支问题')!
    expect(branchNode.parentId).toBe(newAnswer.id)
    const childNode = all.find((node) => node.userContent === '子卡问题')!
    expect(childNode.parentId).toBe(newAnswer.id)

    const clusters = createClusterRepository(handle.db).listWithMembers('p1')
    expect(clusters).toHaveLength(2)
    const childCluster = clusters.find((cluster) => cluster.title === '子卡')!
    expect(childCluster.summary).toBe('子卡摘要')
    expect(childCluster.nodeIds).toEqual([childNode.id])

    const quoteRows = createQuoteRepository(handle.db).listByNode(childNode.id)
    expect(quoteRows).toHaveLength(1)
    expect(quoteRows[0]?.quotedNodeId).toBe(rootNode.id)

    renameLegacyTables(handle.sqlite)
    const names = (
      handle.sqlite
        .prepare("select name from sqlite_master where type = 'table'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name)
    expect(names).toContain('legacy_cards')
    expect(names).toContain('legacy_messages')
    expect(names).not.toContain('cards')
    expect(needsLegacyMigration(handle.db)).toBe(false)
  })
})
