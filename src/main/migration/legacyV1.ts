import { asc, eq } from 'drizzle-orm'
import type { Database } from 'better-sqlite3'
import type { MigrationReport, TurnNode } from '@shared/types'
import type { AppDatabase } from '../db/client'
import {
  cardSummaries,
  cards,
  conversations,
  messageQuotes,
  messages,
  nodes as nodesTable,
  projects,
  topicClusters
} from '../db/schema'
import { createClusterRepository } from '../db/repositories/clusters'
import { createNodeRepository } from '../db/repositories/nodes'
import { createQuoteRepository } from '../db/repositories/quotes'
import { newId } from '../db/ids'

const LEGACY_TABLES = ['cards', 'conversations', 'messages', 'message_quotes', 'card_summaries']

export function needsLegacyMigration(db: AppDatabase): boolean {
  try {
    const legacyCards = db.select({ id: cards.id }).from(cards).all()
    if (legacyCards.length === 0) return false
    const existingNodes = db.select({ id: nodesTable.id }).from(nodesTable).all()
    return existingNodes.length === 0
  } catch {
    return false
  }
}

export function migrateLegacyData(db: AppDatabase, backupPath: string | null): MigrationReport {
  const nodeRepo = createNodeRepository(db)
  const quoteRepo = createQuoteRepository(db)
  const clusterRepo = createClusterRepository(db)
  const projectRows = db.select().from(projects).all()
  const messageNodeMap = new Map<string, string>()

  let cardCount = 0
  let nodeCount = 0
  let clusterCount = 0

  db.transaction(() => {
    for (const project of projectRows) {
      const projectCards = db
        .select()
        .from(cards)
        .where(eq(cards.projectId, project.id))
        .orderBy(asc(cards.createdAt))
        .all()
      if (projectCards.length === 0) continue
      cardCount += projectCards.length

      const ordered = [
        ...projectCards.filter((card) => card.kind === 'root'),
        ...projectCards.filter((card) => card.kind !== 'root')
      ]
      const cardLastNode = new Map<string, string>()
      const cardNodeIds = new Map<string, string[]>()

      for (const card of ordered) {
        const conversation = db
          .select()
          .from(conversations)
          .where(eq(conversations.cardId, card.id))
          .get()
        if (!conversation) continue

        const rows = db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conversation.id))
          .orderBy(asc(messages.turnIndex), asc(messages.createdAt))
          .all()
        if (rows.length === 0) continue

        const byTurn = new Map<number, typeof rows>()
        for (const row of rows) {
          const list = byTurn.get(row.turnIndex) ?? []
          list.push(row)
          byTurn.set(row.turnIndex, list)
        }
        const turnIndexes = [...byTurn.keys()].sort((a, b) => a - b)

        let attachParent: string | null = null
        if (card.kind === 'branch') {
          const fromMessage = card.branchFromMessageId
            ? messageNodeMap.get(card.branchFromMessageId)
            : undefined
          attachParent =
            fromMessage ??
            (card.parentCardId ? cardLastNode.get(card.parentCardId) : undefined) ??
            null
        } else if (card.kind === 'child') {
          attachParent = card.parentCardId ? (cardLastNode.get(card.parentCardId) ?? null) : null
        }

        let firstNodeOfPreviousTurn: string | null = null
        const createdNodeIds: string[] = []

        for (const turnIndex of turnIndexes) {
          const turnRows = byTurn.get(turnIndex) ?? []
          const userRow = turnRows.find((row) => row.role === 'user')
          const assistantRows = turnRows
            .filter((row) => row.role === 'assistant')
            .sort((a, b) => Number(b.isActiveVariant) - Number(a.isActiveVariant))
          const variants = assistantRows.length > 0 ? assistantRows : [null]
          const turnGroupId = variants.length > 1 ? newId() : null

          const parentForTurn = firstNodeOfPreviousTurn ?? attachParent
          let firstVariantNodeId: string | null = null

          for (const assistant of variants) {
            const node: TurnNode = nodeRepo.create({
              projectId: project.id,
              parentId: parentForTurn,
              userContent: userRow?.content ?? '（迁移的提问）',
              model: assistant?.model ?? null,
              turnGroupId,
              isMainBranch: parentForTurn
                ? nodeRepo.countChildren(parentForTurn) === 0
                : true
            })
            if (assistant) {
              if (assistant.status === 'complete') {
                nodeRepo.completeAssistant(node.id, assistant.content, assistant.model)
              } else if (assistant.status === 'aborted') {
                nodeRepo.abortAssistant(node.id, assistant.content)
              } else if (assistant.status === 'error') {
                nodeRepo.failAssistant(
                  node.id,
                  assistant.errorMessage ?? '迁移的历史错误',
                  assistant.content
                )
              } else {
                nodeRepo.failAssistant(node.id, '迁移时仍在生成', assistant.content)
              }
              messageNodeMap.set(assistant.id, node.id)
            }
            if (userRow && firstVariantNodeId === null) {
              messageNodeMap.set(userRow.id, node.id)
            }
            if (firstVariantNodeId === null) firstVariantNodeId = node.id
            createdNodeIds.push(node.id)
            nodeCount += 1
          }

          firstNodeOfPreviousTurn = firstVariantNodeId
        }

        if (firstNodeOfPreviousTurn) cardLastNode.set(card.id, firstNodeOfPreviousTurn)
        if (createdNodeIds.length > 0) cardNodeIds.set(card.id, createdNodeIds)
      }

      for (const card of ordered) {
        if (card.kind === 'root') continue
        const nodeIds = cardNodeIds.get(card.id)
        if (!nodeIds || nodeIds.length === 0) continue
        const cluster = clusterRepo.create({
          projectId: project.id,
          title: card.title,
          nodeIds,
          isCollapsed: true
        })
        const summaryRow = db
          .select()
          .from(cardSummaries)
          .where(eq(cardSummaries.cardId, card.id))
          .get()
        db.update(topicClusters)
          .set({
            titleGenerated: card.titleGenerated,
            summary: summaryRow?.summary ?? null
          })
          .where(eq(topicClusters.id, cluster.id))
          .run()
        clusterCount += 1
      }
    }

    const quoteRows = db.select().from(messageQuotes).all()
    for (const row of quoteRows) {
      const ownerNode = messageNodeMap.get(row.messageId)
      if (!ownerNode) continue
      const quotedNode = row.quotedMessageId
        ? (messageNodeMap.get(row.quotedMessageId) ?? null)
        : null
      quoteRepo.createMany(ownerNode, [{ quotedNodeId: quotedNode, quoteText: row.quoteText }])
    }
  })

  return {
    migratedAt: new Date().toISOString(),
    projects: projectRows.length,
    cards: cardCount,
    nodes: nodeCount,
    clusters: clusterCount,
    backupPath
  }
}

export function renameLegacyTables(sqlite: Database): void {
  const existing = new Set(
    (sqlite.prepare("select name from sqlite_master where type = 'table'").all() as Array<{
      name: string
    }>).map((row) => row.name)
  )
  for (const name of LEGACY_TABLES) {
    if (existing.has(name) && !existing.has(`legacy_${name}`)) {
      sqlite.exec(`ALTER TABLE "${name}" RENAME TO "legacy_${name}"`)
    }
  }
}
