import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useAppStore } from '../stores/appStore'
import { buildCardTreeLayout, CARD_NODE_HEIGHT, CARD_NODE_WIDTH } from './tree/layout'
import { CardFlowNode, type CardNodeData } from './tree/CardFlowNode'

const nodeTypes = { card: CardFlowNode }

export function CardTreePanel() {
  const cards = useAppStore((state) => state.cards)
  const activeCardId = useAppStore((state) => state.activeCardId)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const selectCard = useAppStore((state) => state.selectCard)
  const [fullscreen, setFullscreen] = useState(false)
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null)

  const layout = useMemo(() => buildCardTreeLayout(cards), [cards])

  const nodes = useMemo<Array<Node<CardNodeData>>>(
    () =>
      layout.nodes.map((node) => ({
        id: node.id,
        type: 'card',
        position: { x: node.x, y: node.y },
        data: {
          title: node.card.title,
          kind: node.card.kind,
          active: node.card.id === activeCardId
        },
        draggable: false,
        connectable: false,
        style: { width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT }
      })),
    [layout, activeCardId]
  )

  const edges = useMemo<Edge[]>(
    () =>
      layout.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        style:
          edge.kind === 'branch'
            ? { stroke: '#d97706', strokeDasharray: '4 3' }
            : { stroke: '#475569' }
      })),
    [layout]
  )

  useEffect(() => {
    if (!instance) return
    instance.fitView({ padding: 0.25, duration: 200 })
  }, [instance, layout])

  const flow = (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onInit={setInstance}
      onNodeClick={(_event, node) => void selectCard(node.id)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      onlyRenderVisibleElements
      fitView
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      className="bg-slate-950"
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#1e293b" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  )

  if (!activeProjectId) return null

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-slate-950">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-2">
          <h2 className="text-xs font-medium text-slate-300">卡片树（全屏）</h2>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800"
          >
            退出全屏
          </button>
        </header>
        <div className="min-h-0 flex-1">{flow}</div>
      </div>
    )
  }

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-900/20 lg:flex">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-3 py-2">
        <h2 className="text-xs font-medium text-slate-400">卡片树</h2>
        <button
          type="button"
          title="全屏查看"
          onClick={() => setFullscreen(true)}
          className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-200"
        >
          ⛶
        </button>
      </header>
      <div className="min-h-0 flex-1">{flow}</div>
    </aside>
  )
}
