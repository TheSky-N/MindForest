import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { CardKind } from '@shared/types'

export interface CardNodeData extends Record<string, unknown> {
  title: string
  kind: CardKind
  active: boolean
}

export type CardFlowNodeType = Node<CardNodeData, 'card'>

const kindStyles: Record<CardKind, string> = {
  root: 'border-emerald-600 bg-emerald-950/90 text-emerald-100',
  child: 'border-sky-700 bg-sky-950/90 text-sky-100',
  branch: 'border-amber-600 bg-amber-950/90 text-amber-100'
}

export const CardFlowNode = memo(function CardFlowNode({ data }: NodeProps<CardFlowNodeType>) {
  return (
    <div
      title={data.title}
      className={`box-border flex h-full w-full cursor-pointer items-center rounded-lg border px-2.5 text-xs shadow ${
        kindStyles[data.kind]
      } ${data.active ? 'ring-2 ring-emerald-400' : ''}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-0 !bg-slate-600"
      />
      <span className="w-full truncate">{data.title}</span>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1.5 !w-1.5 !border-0 !bg-slate-600"
      />
    </div>
  )
})
