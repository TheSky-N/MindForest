import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Loader2 } from 'lucide-react'
import type { CardKind, TreeShapeId } from '@shared/types'

export interface CardNodeData extends Record<string, unknown> {
  title: string
  kind: CardKind
  active: boolean
  shape: TreeShapeId
  generating: boolean
}

export type CardFlowNodeType = Node<CardNodeData, 'card'>

const kindStyles: Record<CardKind, string> = {
  root: 'border-node-root-border bg-node-root text-node-root-fg',
  child: 'border-node-child-border bg-node-child text-node-child-fg',
  branch: 'border-node-branch-border bg-node-branch text-node-branch-fg'
}

const shapeStyles: Record<TreeShapeId, string> = {
  rounded: 'rounded-lg px-2.5',
  pill: 'rounded-full px-4',
  square: 'rounded-none px-2.5'
}

export const CardFlowNode = memo(function CardFlowNode({ data }: NodeProps<CardFlowNodeType>) {
  return (
    <div
      title={data.title}
      className={`box-border flex h-full w-full cursor-pointer items-center border text-xs shadow-sm ${
        kindStyles[data.kind]
      } ${shapeStyles[data.shape]} ${data.active ? 'ring-2 ring-accent' : ''}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-border-strong"
      />
      <span className="w-full truncate">{data.title}</span>
      {data.generating && <Loader2 className="ml-1 h-3 w-3 shrink-0 animate-spin" />}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-border-strong"
      />
    </div>
  )
})
