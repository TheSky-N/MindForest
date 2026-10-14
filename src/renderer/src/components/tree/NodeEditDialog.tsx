import { useEffect, useRef } from 'react'

export function NodeEditDialog({
  value,
  onChange,
  syncGroup,
  onSyncGroupChange,
  showSync,
  onCancel,
  onOverwrite,
  onBranchAndSend
}: {
  value: string
  onChange: (value: string) => void
  syncGroup: boolean
  onSyncGroupChange: (value: boolean) => void
  showSync: boolean
  onCancel: () => void
  onOverwrite: () => void
  onBranchAndSend: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onCancel}
    >
      <div
        className="w-[520px] max-w-full rounded-lg border border-border bg-popover p-4 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 className="mb-2 text-xs font-medium text-fg">编辑消息</h3>
        <textarea
          ref={ref}
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
              return
            }
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              onBranchAndSend()
            }
          }}
          className="w-full resize-none rounded border border-border bg-app px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        {showSync && (
          <label className="mt-2 flex items-center gap-2 text-[11px] text-fg-muted">
            <input
              type="checkbox"
              checked={syncGroup}
              onChange={(event) => onSyncGroupChange(event.target.checked)}
            />
            覆盖修改时同步更新同组的其他回答版本
          </label>
        )}
        <p className="mt-2 text-[11px] text-fg-subtle">
          「新开分支并发送」会保留当前分支，在同一父节点下创建新分支并重新生成（Ctrl+Enter）。
        </p>
        <p className="mt-1 text-[11px] text-warning">
          「覆盖修改」将删除该节点的全部子节点（可在回收站恢复）。
        </p>
        <div className="mt-3 flex justify-end gap-2 text-xs">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-fg-muted hover:bg-card-muted"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onOverwrite}
            title="删除该节点的全部子节点（可在回收站恢复）"
            className="rounded border border-warning/50 px-3 py-1.5 text-warning hover:bg-warning/10"
          >
            覆盖修改
          </button>
          <button
            type="button"
            onClick={onBranchAndSend}
            className="rounded bg-accent px-3 py-1.5 text-accent-fg hover:bg-accent-hover"
          >
            新开分支并发送
          </button>
        </div>
      </div>
    </div>
  )
}
