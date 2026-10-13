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
  root: 'border-node-root-border bg-node-root text-node-root-fg',
  child: 'border-node-child-border bg-node-child text-node-child-fg',
  branch: 'border-node-branch-border bg-node-branch text-node-branch-fg'
}

export const CardFlowNode = memo(function CardFlowNode({ data }: NodeProps<CardFlowNodeType>) {
  return (
    <div
      title={data.title}
      className={`box-border flex h-full w-full cursor-pointer items-center rounded-lg border px-2.5 text-xs shadow-sm ${
        kindStyles[data.kind]
      } ${data.active ? 'ring-2 ring-accent' : ''}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-0 !bg-border-strong"
      />
      <span className="w-full truncate">{data.title}</span>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1.5 !w-1.5 !border-0 !bg-border-strong"
      />
    </div>
  )
})
