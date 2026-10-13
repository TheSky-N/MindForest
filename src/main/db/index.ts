import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createDatabase, type DatabaseHandle } from './client'

let handle: DatabaseHandle | null = null

export function getDatabasePath(): string {
  return join(app.getPath('userData'), 'mindforest.db')
}

export function getMigrationsFolder(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'drizzle')
  const candidates = [join(app.getAppPath(), 'drizzle'), join(process.cwd(), 'drizzle')]
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'meta', '_journal.json'))) return candidate
  }
  return candidates[0]!
}

export function initDatabase(): DatabaseHandle {
  if (handle) return handle
  handle = createDatabase({
    url: getDatabasePath(),
    migrationsFolder: getMigrationsFolder()
  })
  return handle
}

export function getDatabaseHandle(): DatabaseHandle {
  if (!handle) throw new Error('数据库尚未初始化')
  return handle
}

export function closeDatabase(): void {
  handle?.sqlite.close()
  handle = null
}
