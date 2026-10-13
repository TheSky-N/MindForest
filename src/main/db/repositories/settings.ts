import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { settings } from '../schema'

export function createSettingsRepository(db: AppDatabase) {
  return {
    get(key: string): string | undefined {
      return db.select().from(settings).where(eq(settings.key, key)).get()?.value
    },

    getJson<T>(key: string): T | undefined {
      const raw = db.select().from(settings).where(eq(settings.key, key)).get()?.value
      if (raw === undefined) return undefined
      try {
        return JSON.parse(raw) as T
      } catch {
        return undefined
      }
    },

    set(key: string, value: string): void {
      const updatedAt = new Date()
      db.insert(settings)
        .values({ key, value, updatedAt })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
        .run()
    },

    setJson(key: string, value: unknown): void {
      this.set(key, JSON.stringify(value))
    },

    remove(key: string): void {
      db.delete(settings).where(eq(settings.key, key)).run()
    }
  }
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>
