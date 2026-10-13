import { useEffect, useMemo, useState } from 'react'
import { Maximize2, Minimize2, PanelRightClose } from 'lucide-react'
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
import { useAppStore, useEffectiveMode } from '../stores/appStore'
import { buildCardTreeLayout, CARD_NODE_HEIGHT, CARD_NODE_WIDTH } from './tree/layout'
import { CardFlowNode, type CardNodeData } from './tree/CardFlowNode'
import { CardShell } from './layout/CardShell'

const nodeTypes = { card: CardFlowNode }

function useCanvasDotColor(): string {
  const themeId = useAppStore((state) => state.preferences.themeId)
  const mode = useEffectiveMode()
  return useMemo(() => {
    void themeId
    void mode
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--mf-canvas-dot')
      .trim()
  }, [themeId, mode])
}

function Flow() {
  const cards = useAppStore((state) => state.cards)
  const activeCardId = useAppStore((state) => state.activeCardId)
  const selectCard = useAppStore((state) => state.selectCard)
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null)
  const dotColor = useCanvasDotColor()

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
            ? { stroke: 'var(--mf-warning)', strokeDasharray: '4 3' }
            : { stroke: 'var(--mf-edge)' }
      })),
    [layout]
  )

  useEffect(() => {
    if (!instance) return
    instance.fitView({ padding: 0.25, duration: 200 })
  }, [instance, layout])

  return (
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
      className="bg-app"
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color={dotColor} />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  )
}

export function CardTreePanel() {
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const togglePanel = useAppStore((state) => state.togglePanel)
  const [fullscreen, setFullscreen] = useState(false)

  if (!activeProjectId) {
    return (
      <CardShell
        header={
          <>
            <h2 className="flex-1 text-xs font-medium text-fg-muted">卡片树</h2>
            <button
              type="button"
              title="折叠卡片树"
              onClick={() => togglePanel('tree')}
              className="rounded p-1 text-fg-subtle hover:bg-card-muted hover:text-fg"
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </button>
          </>
        }
      >
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-fg-subtle">
          创建或选择一个项目后，这里会显示主题卡片树。
        </div>
      </CardShell>
    )
  }

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-app text-fg">
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-2">
          <h2 className="text-xs font-medium text-fg-muted">卡片树（全屏）</h2>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] text-fg-muted hover:bg-card-muted"
          >
            <Minimize2 className="h-3 w-3" />
            退出全屏
          </button>
        </header>
        <div className="min-h-0 flex-1">
          <Flow />
        </div>
      </div>
    )
  }

  return (
    <CardShell
      header={
        <>
          <h2 className="flex-1 text-xs font-medium text-fg-muted">卡片树</h2>
          <button
            type="button"
            title="全屏查看"
            onClick={() => setFullscreen(true)}
            className="rounded p-1 text-fg-subtle hover:bg-card-muted hover:text-fg"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="折叠卡片树"
            onClick={() => togglePanel('tree')}
            className="rounded p-1 text-fg-subtle hover:bg-card-muted hover:text-fg"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        </>
      }
    >
      <div className="min-h-0 flex-1">
        <Flow />
      </div>
    </CardShell>
  )
}
