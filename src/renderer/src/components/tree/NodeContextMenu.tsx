import { useEffect, useMemo, type ComponentType } from 'react'
import {
  Archive,
  ArchiveRestore,
  ArrowRightToLine,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Layers,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
  Type,
  Unlink
} from 'lucide-react'
import type { VisibleTreeNode } from './layout'

export interface NodeContextMenuProps {
  vnode: VisibleTreeNode
  x: number
  y: number
  summarizing: boolean
  selectionCount: number
  onClose: () => void
  onEnter: (vnode: VisibleTreeNode) => void
  onToggleCollapse: (vnode: VisibleTreeNode) => void
  onSetMain: (vnode: VisibleTreeNode) => void
  onToggleArchive: (vnode: VisibleTreeNode) => void
  onRegenerate: (vnode: VisibleTreeNode) => void
  onEdit: (vnode: VisibleTreeNode) => void
  onRename: (vnode: VisibleTreeNode) => void
  onGenerateTitle: (vnode: VisibleTreeNode) => void
  onDelete: (vnode: VisibleTreeNode) => void
  onRenameCluster: (clusterId: string, title: string) => void
  onSummarizeCluster: (clusterId: string) => void
  onToggleClusterCollapsed: (clusterId: string, collapsed: boolean) => void
  onEnterClusterEnd: (clusterId: string) => void
  onDissolveCluster: (clusterId: string) => void
  onCreateClusterFromSelection: () => void
}

const MENU_WIDTH = 208
const MENU_HEIGHT = 330

function MenuItem({
  icon: Icon,
  label,
  disabled,
  danger,
  onClick
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'text-danger hover:bg-danger/15' : 'text-fg-muted hover:bg-card-muted'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

export function NodeContextMenu(props: NodeContextMenuProps) {
  const { vnode, x, y, summarizing, selectionCount, onClose } = props
  const isCluster = vnode.kind === 'cluster'
  const cluster = vnode.cluster

  useEffect(() => {
    const close = () => onClose()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const position = useMemo(() => {
    const left = Math.max(4, Math.min(x, window.innerWidth - MENU_WIDTH - 4))
    const top = Math.max(4, Math.min(y, window.innerHeight - MENU_HEIGHT - 4))
    return { left, top }
  }, [x, y])

  const run = (action: () => void) => () => {
    action()
    onClose()
  }

  return (
    <div
      style={position}
      onMouseDown={(event) => event.stopPropagation()}
      className="fixed z-50 w-52 rounded-lg border border-border bg-popover py-1 shadow-xl"
    >
      {isCluster && cluster ? (
        <>
          <MenuItem
            icon={ArrowRightToLine}
            label="进入主题末端并继续"
            onClick={run(() => props.onEnterClusterEnd(cluster.id))}
          />
          <MenuItem
            icon={vnode.isCollapsed ? ChevronDown : ChevronUp}
            label={vnode.isCollapsed ? '展开主题' : '折叠主题'}
            onClick={run(() => props.onToggleClusterCollapsed(cluster.id, !vnode.isCollapsed))}
          />
          <MenuItem
            icon={Pencil}
            label="重命名主题"
            onClick={run(() => props.onRenameCluster(cluster.id, cluster.title))}
          />
          <MenuItem
            icon={Sparkles}
            label={summarizing ? '正在总结主题…' : 'AI 总结主题'}
            disabled={summarizing}
            onClick={run(() => props.onSummarizeCluster(cluster.id))}
          />
          <MenuItem
            icon={Unlink}
            label="解散主题"
            danger
            onClick={run(() => props.onDissolveCluster(cluster.id))}
          />
        </>
      ) : (
        <>
          <MenuItem icon={ArrowRightToLine} label="进入并继续" onClick={run(() => props.onEnter(vnode))} />
          {vnode.childCount > 0 && (
            <MenuItem
              icon={vnode.isCollapsed ? ChevronDown : ChevronUp}
              label={vnode.isCollapsed ? '展开子节点' : '折叠子节点'}
              onClick={run(() => props.onToggleCollapse(vnode))}
            />
          )}
          {vnode.meta && vnode.meta.parentId && !vnode.isMainBranch && (
            <MenuItem icon={GitBranch} label="设为主分支" onClick={run(() => props.onSetMain(vnode))} />
          )}
          <MenuItem
            icon={vnode.isArchived ? ArchiveRestore : Archive}
            label={vnode.isArchived ? '取消归档' : '归档节点'}
            onClick={run(() => props.onToggleArchive(vnode))}
          />
          <MenuItem
            icon={RefreshCw}
            label="重新生成回答"
            onClick={run(() => props.onRegenerate(vnode))}
          />
          <MenuItem icon={Pencil} label="编辑消息" onClick={run(() => props.onEdit(vnode))} />
          <MenuItem
            icon={Type}
            label="重命名节点"
            onClick={run(() => props.onRename(vnode))}
          />
          <MenuItem
            icon={Sparkles}
            label="AI 生成标题"
            onClick={run(() => props.onGenerateTitle(vnode))}
          />
          <div className="my-1 border-t border-border" />
          {selectionCount > 0 && (
            <MenuItem
              icon={Layers}
              label={`创建主题（已选 ${selectionCount} 个）`}
              onClick={run(() => props.onCreateClusterFromSelection())}
            />
          )}
          <MenuItem icon={Trash2} label="删除节点" danger onClick={run(() => props.onDelete(vnode))} />
        </>
      )}
    </div>
  )
}
