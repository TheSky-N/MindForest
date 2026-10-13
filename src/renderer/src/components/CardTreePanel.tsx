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
import type { Card, TreeEdgeId } from '@shared/types'
import { useAppStore, useEffectiveMode } from '../stores/appStore'
import { buildCardTreeLayout, resolveNodeSize } from './tree/layout'
import { CardFlowNode, type CardNodeData } from './tree/CardFlowNode'
import { CardContextMenu } from './tree/CardContextMenu'
import { TreeRenameDialog } from './tree/TreeRenameDialog'
import { CardShell } from './layout/CardShell'

const nodeTypes = { card: CardFlowNode }

const EDGE_TYPES: Record<TreeEdgeId, string> = {
  bezier: 'default',
  smoothstep: 'smoothstep',
  straight: 'straight',
  step: 'step'
}

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
  const treePreferences = useAppStore((state) => state.preferences.tree)
  const titleGenerating = useAppStore((state) => state.titleGenerating)
  const createChildCard = useAppStore((state) => state.createChildCard)
  const createBranchFromCard = useAppStore((state) => state.createBranchFromCard)
  const renameCard = useAppStore((state) => state.renameCard)
  const deleteCard = useAppStore((state) => state.deleteCard)
  const generateCardTitle = useAppStore((state) => state.generateCardTitle)

  const [instance, setInstance] = useState<ReactFlowInstance | null>(null)
  const [menu, setMenu] = useState<{ card: Card; x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<{ card: Card; value: string } | null>(null)
  const dotColor = useCanvasDotColor()

  const nodeSize = useMemo(() => resolveNodeSize(treePreferences.aspect), [treePreferences.aspect])

  const layout = useMemo(
    () =>
      buildCardTreeLayout(cards, {
        nodeWidth: nodeSize.width,
        nodeHeight: nodeSize.height
      }),
    [cards, nodeSize]
  )

  const nodes = useMemo<Array<Node<CardNodeData>>>(
    () =>
      layout.nodes.map((node) => ({
        id: node.id,
        type: 'card',
        position: { x: node.x, y: node.y },
        data: {
          title: node.card.title,
          kind: node.card.kind,
          active: node.card.id === activeCardId,
          shape: treePreferences.shape,
          generating: titleGenerating.includes(node.card.id)
        },
        draggable: false,
        connectable: false,
        style: { width: nodeSize.width, height: nodeSize.height }
      })),
    [layout, activeCardId, treePreferences.shape, titleGenerating, nodeSize]
  )

  const edges = useMemo<Edge[]>(
    () =>
      layout.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: EDGE_TYPES[treePreferences.edge],
        style:
          edge.kind === 'branch'
            ? { stroke: 'var(--mf-warning)', strokeDasharray: '4 3' }
            : { stroke: 'var(--mf-edge)' }
      })),
    [layout, treePreferences.edge]
  )

  useEffect(() => {
    if (!instance) return
    instance.fitView({ padding: 0.25, duration: 200 })
  }, [instance, layout, nodeSize])

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={setInstance}
        onNodeClick={(_event, node) => void selectCard(node.id)}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          const card = cards.find((item) => item.id === node.id)
          if (card) setMenu({ card, x: event.clientX, y: event.clientY })
        }}
        onPaneClick={() => setMenu(null)}
        onMoveStart={() => setMenu(null)}
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

      {menu && (
        <CardContextMenu
          card={menu.card}
          x={menu.x}
          y={menu.y}
          generating={titleGenerating.includes(menu.card.id)}
          onClose={() => setMenu(null)}
          onCreateChild={(card) => void createChildCard(card.id)}
          onCreateBranch={(card) => void createBranchFromCard(card.id)}
          onRename={(card) => setRenaming({ card, value: card.title })}
          onGenerateTitle={(card) => void generateCardTitle(card.id)}
          onDelete={(card) => {
            if (window.confirm(`删除卡片「${card.title}」及其全部子卡片？`)) {
              void deleteCard(card.id)
            }
          }}
        />
      )}

      {renaming && (
        <TreeRenameDialog
          value={renaming.value}
          onChange={(value) => setRenaming({ card: renaming.card, value })}
          onCancel={() => setRenaming(null)}
          onConfirm={() => {
            const trimmed = renaming.value.trim()
            if (trimmed && trimmed !== renaming.card.title) {
              void renameCard(renaming.card.id, trimmed)
            }
            setRenaming(null)
          }}
        />
      )}
    </div>
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
