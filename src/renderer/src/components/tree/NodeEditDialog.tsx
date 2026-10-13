import { useEffect, useRef } from 'react'

export function NodeEditDialog({
  value,
  onChange,
  syncGroup,
  onSyncGroupChange,
  showSync,
  onCancel,
  onConfirm
}: {
  value: string
  onChange: (value: string) => void
  syncGroup: boolean
  onSyncGroupChange: (value: boolean) => void
  showSync: boolean
  onCancel: () => void
  onConfirm: () => void
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
          className="w-full resize-none rounded border border-border bg-app px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        {showSync && (
          <label className="mt-2 flex items-center gap-2 text-[11px] text-fg-muted">
            <input
              type="checkbox"
              checked={syncGroup}
              onChange={(event) => onSyncGroupChange(event.target.checked)}
            />
            同步更新同组的其他回答版本
          </label>
        )}
        <p className="mt-2 text-[11px] text-warning">
          保存后将删除该节点的全部子节点（可在回收站恢复）。
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
            onClick={onConfirm}
            className="rounded bg-accent px-3 py-1.5 text-accent-fg hover:bg-accent-hover"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
