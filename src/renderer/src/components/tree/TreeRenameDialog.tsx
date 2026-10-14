import { useEffect, useRef } from 'react'

export function TreeRenameDialog({
  value,
  onChange,
  onCancel,
  onConfirm,
  heading = '重命名'
}: {
  value: string
  onChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
  heading?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={onCancel}
    >
      <div
        className="w-80 rounded-lg border border-border bg-popover p-4 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 className="mb-2 text-xs font-medium text-fg">{heading}</h3>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onConfirm()
            if (event.key === 'Escape') onCancel()
          }}
          className="w-full rounded border border-border bg-app px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
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
