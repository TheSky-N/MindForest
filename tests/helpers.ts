import { resolve } from 'node:path'
import { createDatabase, type DatabaseHandle } from '@main/db/client'

export function createTestDatabase(): DatabaseHandle {
  return createDatabase({
    url: ':memory:',
    migrationsFolder: resolve(process.cwd(), 'drizzle')
  })
}

export function countRows(handle: DatabaseHandle, table: string): number {
  const row = handle.sqlite.prepare(`select count(*) as count from ${table}`).get() as {
    count: number
  }
  return row.count
}
