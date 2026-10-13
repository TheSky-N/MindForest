import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type AppDatabase = BetterSQLite3Database<typeof schema>

export interface DatabaseHandle {
  sqlite: Database.Database
  db: AppDatabase
}

export function createDatabase(options: { url: string; migrationsFolder: string }): DatabaseHandle {
  const sqlite = new Database(options.url)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: options.migrationsFolder })

  return { sqlite, db }
}
