import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import {
  AlertCircle,
  Archive,
  ChevronDown,
  ChevronRight,
  Layers,
  Loader2,
  OctagonX
} from 'lucide-react'
import type { TreeShapeId } from '@shared/types'

export interface TreeNodeData extends Record<string, unknown> {
  label: string
  kind: 'node' | 'cluster'
  shape: TreeShapeId
  active: boolean
  preview: boolean
  selected: boolean
  dimmed: boolean
  mainPath: boolean
  archived: boolean
  collapsed: boolean
  childCount: number
  status: 'streaming' | 'complete' | 'aborted' | 'error'
  versionLabel: string | null
  summarizing: boolean
  clusterSummary: string | null
  groupBox: boolean
}

export type TreeFlowNodeType = Node<TreeNodeData, 'treeNode'>

const shapeStyles: Record<TreeShapeId, string> = {
  rounded: 'rounded-lg px-2.5',
  pill: 'rounded-full px-3.5',
  square: 'rounded-none px-2.5'
}

export const TreeNodeView = memo(function TreeNodeView({ data }: NodeProps<TreeFlowNodeType>) {
  if (data.groupBox) {
    return (
      <div className="pointer-events-none box-border h-full w-full rounded-xl border-2 border-dashed border-accent/50 bg-accent/5">
        <span className="absolute left-3 top-1.5 text-[10px] font-medium text-accent/80">
          {data.label} · {data.childCount} 轮
        </span>
      </div>
    )
  }
  const tooltip =
    data.kind === 'cluster'
      ? `${data.label}（主题 · ${data.childCount} 轮）${data.clusterSummary ? `\n${data.clusterSummary}` : ''}`
      : data.label
  return (
    <div
      title={tooltip}
      className={`box-border flex h-full w-full cursor-pointer items-center gap-1 border text-xs shadow-sm ${
        shapeStyles[data.shape]
      } ${
        data.kind === 'cluster'
          ? 'border-accent/70 bg-accent/15 text-fg'
          : 'border-border bg-card text-fg'
      } ${data.mainPath ? 'border-accent' : ''} ${
        data.preview || data.active ? 'ring-2 ring-accent' : ''
      } ${data.selected ? 'ring-2 ring-warning' : ''} ${
        data.dimmed ? 'opacity-45' : ''
      } ${data.archived ? 'opacity-45' : ''}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-border-strong"
      />
      {data.kind === 'cluster' ? (
        <Layers className="h-3 w-3 shrink-0 text-accent" />
      ) : data.childCount > 0 ? (
        data.collapsed ? (
          <ChevronRight className="h-3 w-3 shrink-0 text-fg-subtle" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0 text-fg-subtle" />
        )
      ) : null}
      <span className="w-full truncate">{data.label}</span>
      {data.kind === 'cluster' && (
        <span className="shrink-0 rounded bg-accent/20 px-1 text-[10px] text-accent">
          {data.childCount}
        </span>
      )}
      {data.versionLabel && (
        <span className="shrink-0 rounded bg-card-muted px-1 text-[10px] text-fg-muted">
          {data.versionLabel}
        </span>
      )}
      {data.summarizing && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />}
      {data.archived && <Archive className="h-3 w-3 shrink-0 text-fg-subtle" />}
      {data.status === 'streaming' && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
      {data.status === 'error' && <AlertCircle className="h-3 w-3 shrink-0 text-danger" />}
      {data.status === 'aborted' && <OctagonX className="h-3 w-3 shrink-0 text-warning" />}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-border-strong"
      />
    </div>
  )
})
