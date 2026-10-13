import { useEffect, useState } from 'react'
import { ArchiveRestore, Trash2, X } from 'lucide-react'
import type { DeletedNodeInfo } from '@shared/types'
import { useAppStore } from '../../stores/appStore'

export function DeletedNodesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const restoreNode = useAppStore((state) => state.restoreNode)
  const purgeNode = useAppStore((state) => state.purgeNode)
  const [items, setItems] = useState<DeletedNodeInfo[]>([])

  useEffect(() => {
    if (!open || !activeProjectId) return
    let cancelled = false
    void window.mindforest.tree
      .listDeleted({ projectId: activeProjectId })
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, activeProjectId])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[70vh] w-[560px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-xs font-medium text-fg">回收站（已删除的节点）</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-fg-subtle hover:bg-card-muted hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-fg-subtle">回收站为空</p>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => (
                <li
                  key={item.node.id}
                  className="flex items-center gap-2 rounded border border-border bg-card px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-fg-muted" title={item.node.userContent}>
                    {item.node.userContent}
                  </span>
                  <span className="shrink-0 text-[10px] text-fg-subtle">
                    {item.descendantCount} 个子节点
                  </span>
                  <button
                    type="button"
                    title="恢复"
                    onClick={() => {
                      void restoreNode(item.node.id).then(() => {
                        setItems((list) => list.filter((entry) => entry.node.id !== item.node.id))
                      })
                    }}
                    className="rounded p-1 text-fg-subtle hover:bg-card-muted hover:text-accent"
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="彻底删除"
                    onClick={() => {
                      if (window.confirm('彻底删除该节点及其子树？此操作不可恢复。')) {
                        void purgeNode(item.node.id).then(() => {
                          setItems((list) => list.filter((entry) => entry.node.id !== item.node.id))
                        })
                      }
                    }}
                    className="rounded p-1 text-fg-subtle hover:bg-danger/15 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
