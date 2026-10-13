import { FolderOpen } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

export function DataSection() {
  const info = useAppStore((state) => state.info)

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-medium text-fg">本地数据</h3>
      <p className="text-[11px] leading-relaxed text-fg-muted">
        所有项目、卡片与对话都保存在本地 SQLite 数据库中，不会上传到任何服务器。
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
    </div>
  )
}
