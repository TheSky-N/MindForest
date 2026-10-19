import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  autoBackup,
  createBackup,
  isBackupFile,
  listBackups,
  pruneBackups,
  restoreBackupFile
} from '@main/backup/backupService'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mindforest-backup-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('数据库备份', () => {
  it('创建、列出、裁剪并恢复备份', async () => {
    const dir = tempDir()
    const dbPath = join(dir, 'mindforest.db')
    const sqlite = new Database(dbPath)
    sqlite.exec('create table notes(id integer primary key, body text);')
    sqlite.prepare('insert into notes(body) values (?)').run('原始内容')

    const backup = await createBackup(sqlite, join(dir, 'backups'), 'manual')
    expect(existsSync(backup.filePath)).toBe(true)
    expect(isBackupFile(backup.fileName)).toBe(true)
    expect(isBackupFile('../evil.db')).toBe(false)
    expect(listBackups(join(dir, 'backups'))[0]?.fileName).toBe(backup.fileName)

    sqlite.prepare('insert into notes(body) values (?)').run('新增内容')
    sqlite.close()

    restoreBackupFile(backup.filePath, dbPath)
    const restored = new Database(dbPath)
    const rows = restored.prepare('select body from notes order by id').all() as Array<{
      body: string
    }>
    expect(rows.map((row) => row.body)).toEqual(['原始内容'])
    restored.close()
  })

  it('自动备份间隔内不重复创建，并保留指定数量', async () => {
    const dir = tempDir()
    const dbPath = join(dir, 'mindforest.db')
    const sqlite = new Database(dbPath)
    sqlite.exec('create table t(x integer);')

    const first = await autoBackup(sqlite, join(dir, 'backups'), 60_000)
    expect(first).not.toBeNull()
    const second = await autoBackup(sqlite, join(dir, 'backups'), 60_000)
    expect(second).toBeNull()

    for (let index = 0; index < 4; index += 1) {
      await createBackup(sqlite, join(dir, 'backups'), `manual-${index}`)
    }
    pruneBackups(join(dir, 'backups'), 2)
    expect(listBackups(join(dir, 'backups'))).toHaveLength(2)
    sqlite.close()
  })
})
