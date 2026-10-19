import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type Database from 'better-sqlite3'
import type { BackupInfo } from '@shared/types'

export const BACKUP_PREFIX = 'mindforest-'
export const MAX_BACKUPS = 12
export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function backupStamp(date: Date): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('')
}

export function backupFileName(date: Date, label: string): string {
  return `${BACKUP_PREFIX}${backupStamp(date)}-${label}.db`
}

export function toBackupInfo(filePath: string): BackupInfo {
  const stats = statSync(filePath)
  return {
    fileName: basename(filePath),
    filePath,
    size: stats.size,
    createdAt: stats.mtime
  }
}

export function listBackups(dir: string): BackupInfo[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith('.db'))
    .map((name) => join(dir, name))
    .filter((filePath) => existsSync(filePath))
    .map(toBackupInfo)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function createBackup(
  sqlite: Database.Database,
  dir: string,
  label = 'manual'
): Promise<BackupInfo> {
  mkdirSync(dir, { recursive: true })
  const now = new Date()
  let filePath = join(dir, backupFileName(now, label))
  let suffix = 1
  while (existsSync(filePath)) {
    filePath = join(dir, backupFileName(now, `${label}-${suffix}`))
    suffix += 1
  }
  await sqlite.backup(filePath)
  return toBackupInfo(filePath)
}

export function pruneBackups(dir: string, keep = MAX_BACKUPS): string[] {
  const removed: string[] = []
  for (const backup of listBackups(dir).slice(keep)) {
    try {
      rmSync(backup.filePath, { force: true })
      removed.push(backup.filePath)
    } catch {
      void 0
    }
  }
  return removed
}

export async function autoBackup(
  sqlite: Database.Database,
  dir: string,
  intervalMs = AUTO_BACKUP_INTERVAL_MS
): Promise<BackupInfo | null> {
  const latest = listBackups(dir)[0]
  if (latest && Date.now() - latest.createdAt.getTime() < intervalMs) return null
  const backup = await createBackup(sqlite, dir, 'auto')
  pruneBackups(dir)
  return backup
}

export function restoreBackupFile(backupPath: string, databasePath: string): void {
  if (!existsSync(backupPath)) throw new Error('备份文件不存在')
  copyFileSync(backupPath, databasePath)
  for (const suffix of ['-wal', '-shm']) {
    rmSync(`${databasePath}${suffix}`, { force: true })
  }
}

export function isBackupFile(fileName: string): boolean {
  if (!fileName || basename(fileName) !== fileName) return false
  return fileName.startsWith(BACKUP_PREFIX) && fileName.endsWith('.db')
}
