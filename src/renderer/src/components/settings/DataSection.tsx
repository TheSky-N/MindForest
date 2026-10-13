import { FolderOpen } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

export function DataSection() {
  const info = useAppStore((state) => state.info)
  const migrationReport = useAppStore((state) => state.migrationReport)

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-medium text-fg">本地数据</h3>
      <p className="text-[11px] leading-relaxed text-fg-muted">
        所有项目、对话与主题都保存在本地 SQLite 数据库中，不会上传到任何服务器。
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
      {migrationReport && (
        <div className="rounded border border-border bg-card-muted/40 px-3 py-2 text-[11px] leading-relaxed text-fg-muted">
          <p className="mb-1 text-fg">已完成 v0.2.0 对话树迁移</p>
          <p>
            迁移时间：{new Date(migrationReport.migratedAt).toLocaleString()}；
            迁移项目 {migrationReport.projects} 个、旧卡片 {migrationReport.cards} 张；
            生成节点 {migrationReport.nodes} 个、主题 {migrationReport.clusters} 个。
          </p>
          {migrationReport.backupPath && (
            <p className="mt-1">
              迁移前的数据库备份：<span className="break-all">{migrationReport.backupPath}</span>
            </p>
          )}
          <p className="mt-1">
            提示：旧版「子卡片只携带父卡片摘要」已改为「完整祖先链 + 自动链摘要」，回答风格可能与迁移前略有差异。
          </p>
        </div>
      )}
    </div>
  )
}
