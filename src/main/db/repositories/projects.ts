import { desc, eq } from 'drizzle-orm'
import type { Project } from '@shared/types'
import type { AppDatabase } from '../client'
import { projects } from '../schema'
import { newId } from '../ids'

export function createProjectRepository(db: AppDatabase) {
  return {
    create(input: { name: string }): Project {
      const now = new Date()
      const project: Project = {
        id: newId(),
        name: input.name,
        createdAt: now,
        updatedAt: now
      }
      db.insert(projects).values(project).run()
      return project
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

    touch(id: string): void {
      db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, id)).run()
    },

    delete(id: string): void {
      db.delete(projects).where(eq(projects.id, id)).run()
    }
  }
}

export type ProjectRepository = ReturnType<typeof createProjectRepository>
