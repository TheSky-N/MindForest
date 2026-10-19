import { useEffect, useState } from 'react'
import { DatabaseBackup, FolderOpen, RotateCcw } from 'lucide-react'
import type { BackupInfo } from '@shared/types'
import { useAppStore } from '../../stores/appStore'

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}

export function DataSection() {
  const info = useAppStore((state) => state.info)
  const migrationReport = useAppStore((state) => state.migrationReport)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = async () => {
    try {
      setBackups(await window.mindforest.app.listBackups())
    } catch {
      setBackups([])
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const backupNow = async () => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const backup = await window.mindforest.app.backupNow()
      setNotice(`备份已创建：${backup.filePath}`)
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const restore = async (backup: BackupInfo) => {
    const confirmed = window.confirm(
      `恢复备份「${backup.fileName}」会覆盖当前数据库，并自动重启 MindForest。继续？`
    )
    if (!confirmed) return
    setBusy(true)
    setNotice(null)
    try {
      await window.mindforest.app.restoreBackup({ fileName: backup.fileName })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-medium text-fg">本地数据</h3>
      <p className="text-[11px] leading-relaxed text-fg-muted">
        所有项目、对话与主题都保存在本地 SQLite 数据库中，不会上传到任何服务器。应用启动时会在 24
        小时内没有备份的情况下自动备份一次，并保留最近 12 份。
      </p>
      <div className="flex items-center gap-2">
        <code
          className="min-w-0 flex-1 truncate rounded border border-border bg-app px-2 py-1.5 text-[11px] text-fg-muted"
          title={info?.dbPath}
        >
          {info?.dbPath ?? ''}
        </code>
        <button
          type="button"
          onClick={() => void window.mindforest.app.openDataDir()}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted hover:bg-card-muted"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          打开数据目录
        </button>
      </div>

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-card-muted/30 p-3">
        <div className="flex items-center gap-2">
          <h4 className="flex-1 text-xs font-medium text-fg">数据库备份</h4>
          <button
            type="button"
            onClick={() => void backupNow()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md border border-accent/60 px-2.5 py-1 text-[11px] text-accent hover:bg-accent/10 disabled:opacity-40"
          >
            <DatabaseBackup className="h-3.5 w-3.5" />
            立即备份
          </button>
          <button
            type="button"
            onClick={() => void window.mindforest.app.openBackupsDir()}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] text-fg-muted hover:bg-card-muted"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            备份目录
          </button>
        </div>
        {notice && <p className="break-all text-[10px] text-accent">{notice}</p>}
        {backups.length === 0 ? (
          <p className="text-[10px] text-fg-subtle">还没有备份。</p>
        ) : (
          <ul className="max-h-52 space-y-1 overflow-y-auto">
            {backups.map((backup) => (
              <li
                key={backup.fileName}
                className="flex items-center gap-2 rounded border border-border/60 bg-app px-2 py-1 text-[10px] text-fg-muted"
              >
                <span className="min-w-0 flex-1 truncate" title={backup.filePath}>
                  {backup.fileName}
                </span>
                <span className="shrink-0 text-fg-subtle">
                  {new Date(backup.createdAt).toLocaleString()} · {formatSize(backup.size)}
                </span>
                <button
                  type="button"
                  onClick={() => void restore(backup)}
                  disabled={busy}
                  className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-fg-subtle hover:bg-card-muted hover:text-warning disabled:opacity-40"
                >
                  <RotateCcw className="h-3 w-3" />
                  恢复
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {migrationReport && (
        <div className="rounded border border-border bg-card-muted/40 px-3 py-2 text-[11px] leading-relaxed text-fg-muted">
          <p className="mb-1 text-fg">已完成 v0.2.0 对话树迁移</p>
          <p>
            迁移时间：{new Date(migrationReport.migratedAt).toLocaleString()}； 迁移项目{' '}
            {migrationReport.projects} 个、旧卡片 {migrationReport.cards} 张； 生成节点{' '}
            {migrationReport.nodes} 个、主题 {migrationReport.clusters} 个。
          </p>
          {migrationReport.backupPath && (
            <p className="mt-1">
              迁移前的数据库备份：<span className="break-all">{migrationReport.backupPath}</span>
            </p>
          )}
          <p className="mt-1">
            提示：旧版「子卡片只携带父卡片摘要」已改为「完整祖先链 +
            自动链摘要」，回答风格可能与迁移前略有差异。
          </p>
        </div>
      )}
    </div>
  )
}
