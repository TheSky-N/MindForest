import { desc, eq } from 'drizzle-orm'
import type { Card, Project } from '@shared/types'
import type { AppDatabase } from '../client'
import { cards, conversations, projects } from '../schema'
import { newId } from '../ids'

export function createProjectRepository(db: AppDatabase) {
  return {
    create(input: { name: string }): { project: Project; rootCard: Card } {
      return db.transaction((tx) => {
        const now = new Date()
        const project: Project = {
          id: newId(),
          name: input.name,
          createdAt: now,
          updatedAt: now
        }
        tx.insert(projects).values(project).run()

        const rootCard: Card = {
          id: newId(),
          projectId: project.id,
          parentCardId: null,
          kind: 'root',
          branchFromMessageId: null,
          inheritedContext: null,
          title: input.name,
          titleGenerated: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now
        }
        tx.insert(cards).values(rootCard).run()

        tx.insert(conversations)
          .values({ id: newId(), cardId: rootCard.id, title: null, createdAt: now, updatedAt: now })
          .run()

        return { project, rootCard }
      })
    },

    list(): Project[] {
      return db.select().from(projects).orderBy(desc(projects.updatedAt)).all()
    },

    get(id: string): Project | undefined {
      return db.select().from(projects).where(eq(projects.id, id)).get()
    },

    rename(id: string, name: string): Project {
      db.update(projects).set({ name, updatedAt: new Date() }).where(eq(projects.id, id)).run()
      const project = this.get(id)
      if (!project) throw new Error('项目不存在')
      return project
    },

    delete(id: string): void {
      db.delete(projects).where(eq(projects.id, id)).run()
    }
  }
}

export type ProjectRepository = ReturnType<typeof createProjectRepository>
