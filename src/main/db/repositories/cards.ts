import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Card } from '@shared/types'
import type { AppDatabase } from '../client'
import { cards, conversations } from '../schema'
import { newId } from '../ids'

function nextSortOrder(db: AppDatabase, projectId: string, parentCardId: string | null): number {
  const siblings = db
    .select({ sortOrder: cards.sortOrder })
    .from(cards)
    .where(
      parentCardId === null
        ? and(eq(cards.projectId, projectId), isNull(cards.parentCardId))
        : and(eq(cards.projectId, projectId), eq(cards.parentCardId, parentCardId))
    )
    .all()
  return siblings.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1
}

export function createCardRepository(db: AppDatabase) {
  const repo = {
    get(id: string): Card | undefined {
      return db.select().from(cards).where(eq(cards.id, id)).get()
    },

    getOrThrow(id: string): Card {
      const card = repo.get(id)
      if (!card) throw new Error('卡片不存在')
      return card
    },

    listByProject(projectId: string): Card[] {
      return db
        .select()
        .from(cards)
        .where(eq(cards.projectId, projectId))
        .orderBy(asc(cards.createdAt))
        .all()
    },

    createChild(input: { parentCardId: string; title?: string }): Card {
      const parent = repo.getOrThrow(input.parentCardId)
      return db.transaction((tx) => {
        const now = new Date()
        const card: Card = {
          id: newId(),
          projectId: parent.projectId,
          parentCardId: parent.id,
          kind: 'child',
          branchFromMessageId: null,
          inheritedContext: null,
          title: input.title?.trim() || '新子卡片',
          sortOrder: nextSortOrder(db, parent.projectId, parent.id),
          createdAt: now,
          updatedAt: now
        }
        tx.insert(cards).values(card).run()
        tx.insert(conversations)
          .values({ id: newId(), cardId: card.id, title: null, createdAt: now, updatedAt: now })
          .run()
        return card
      })
    },

    createBranch(input: {
      sourceCardId: string
      fromMessageId: string
      inheritedContext: string
      title?: string
    }): Card {
      const source = repo.getOrThrow(input.sourceCardId)
      return db.transaction((tx) => {
        const now = new Date()
        const card: Card = {
          id: newId(),
          projectId: source.projectId,
          parentCardId: source.id,
          kind: 'branch',
          branchFromMessageId: input.fromMessageId,
          inheritedContext: input.inheritedContext,
          title: input.title?.trim() || '新分支',
          sortOrder: nextSortOrder(db, source.projectId, source.id),
          createdAt: now,
          updatedAt: now
        }
        tx.insert(cards).values(card).run()
        tx.insert(conversations)
          .values({ id: newId(), cardId: card.id, title: null, createdAt: now, updatedAt: now })
          .run()
        return card
      })
    },

    rename(id: string, title: string): Card {
      const trimmed = title.trim()
      if (!trimmed) throw new Error('卡片标题不能为空')
      db.update(cards).set({ title: trimmed, updatedAt: new Date() }).where(eq(cards.id, id)).run()
      return repo.getOrThrow(id)
    },

    delete(id: string): void {
      const card = repo.getOrThrow(id)
      if (card.kind === 'root') throw new Error('中心主题卡片不能删除')
      db.delete(cards).where(eq(cards.id, id)).run()
    },

    touch(id: string): void {
      db.update(cards).set({ updatedAt: new Date() }).where(eq(cards.id, id)).run()
    },

    countChildren(cardId: string): number {
      const row = db
        .select({ value: sql<number>`count(*)` })
        .from(cards)
        .where(eq(cards.parentCardId, cardId))
        .get()
      return row?.value ?? 0
    },

    findBranchCardForMessage(messageId: string): Card | undefined {
      return db.select().from(cards).where(eq(cards.branchFromMessageId, messageId)).get()
    }
  }
  return repo
}

export type CardRepository = ReturnType<typeof createCardRepository>
