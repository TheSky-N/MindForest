import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Layers,
  Maximize2,
  Minimize2,
  MousePointerSquareDashed,
  PanelRightClose,
  Sparkles
} from 'lucide-react'
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
import type { TreeEdgeId } from '@shared/types'
import { useAppStore, useEffectiveMode } from '../stores/appStore'
import {
  buildVisibleTree,
  computeMainPathIds,
  resolveNodeSize,
  type VisibleTreeNode
} from './tree/layout'
import { TreeNodeView, type TreeNodeData } from './tree/TreeNode'
import { NodeContextMenu } from './tree/NodeContextMenu'
import { NodeEditDialog } from './tree/NodeEditDialog'
import { TreeRenameDialog } from './tree/TreeRenameDialog'
import { DeletedNodesDialog } from './tree/DeletedNodesDialog'
import { CardShell } from './layout/CardShell'

const nodeTypes = { treeNode: TreeNodeView }

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
  const nodes = useAppStore((state) => state.nodes)
  const clusters = useAppStore((state) => state.clusters)
  const membership = useAppStore((state) => state.membership)
  const activeNodeId = useAppStore((state) => state.activeNodeId)
  const previewNodeId = useAppStore((state) => state.previewNodeId)
  const pathNodes = useAppStore((state) => state.pathNodes)
  const selectedNodeIds = useAppStore((state) => state.selectedNodeIds)
  const clusterSummarizing = useAppStore((state) => state.clusterSummarizing)
  const notice = useAppStore((state) => state.notice)
  const clearNotice = useAppStore((state) => state.clearNotice)
  const treePreferences = useAppStore((state) => state.preferences.tree)

  const openNode = useAppStore((state) => state.openNode)
  const setSelection = useAppStore((state) => state.setSelection)
  const setMainBranch = useAppStore((state) => state.setMainBranch)
  const setArchived = useAppStore((state) => state.setArchived)
  const setCollapsed = useAppStore((state) => state.setCollapsed)
  const deleteNode = useAppStore((state) => state.deleteNode)
  const regenerate = useAppStore((state) => state.regenerate)
  const editNode = useAppStore((state) => state.editNode)
  const createClusterFromSelection = useAppStore((state) => state.createClusterFromSelection)
  const renameCluster = useAppStore((state) => state.renameCluster)
  const summarizeCluster = useAppStore((state) => state.summarizeCluster)
  const setClusterCollapsed = useAppStore((state) => state.setClusterCollapsed)
  const deleteCluster = useAppStore((state) => state.deleteCluster)

  const [instance, setInstance] = useState<ReactFlowInstance | null>(null)
  const [menu, setMenu] = useState<{ vnode: VisibleTreeNode; x: number; y: number } | null>(null)
  const [paneMenu, setPaneMenu] = useState<{ x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<{ clusterId: string; value: string } | null>(null)
  const [editing, setEditing] = useState<{
    nodeId: string
    value: string
    syncGroup: boolean
    showSync: boolean
  } | null>(null)
  const [deletedOpen, setDeletedOpen] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const lastClickRef = useRef<{ id: string; at: number } | null>(null)
  const dotColor = useCanvasDotColor()

  const nodeSize = useMemo(() => resolveNodeSize(treePreferences.aspect), [treePreferences.aspect])

  const result = useMemo(
    () =>
      buildVisibleTree(
        { nodes, clusters, membership },
        { nodeWidth: nodeSize.width, nodeHeight: nodeSize.height }
      ),
    [nodes, clusters, membership, nodeSize]
  )

  const mainPathIds = useMemo(() => computeMainPathIds(result), [result])

  const currentVnodeIds = useMemo(() => {
    const set = new Set<string>()
    for (const entry of pathNodes) {
      const vnodeId = result.vnodeIdByNodeId[entry.id]
      if (vnodeId) set.add(vnodeId)
    }
    if (activeNodeId) {
      const vnodeId = result.vnodeIdByNodeId[activeNodeId]
      if (vnodeId) set.add(vnodeId)
    }
    if (previewNodeId) {
      const vnodeId = result.vnodeIdByNodeId[previewNodeId]
      if (vnodeId) set.add(vnodeId)
    }
    return set
  }, [pathNodes, activeNodeId, previewNodeId, result])

  const rfNodes = useMemo<Array<Node<TreeNodeData>>>(
    () =>
      result.nodes.map((vnode) => {
        const isGroupBox = Boolean(vnode.isGroupBox)
        return {
          id: vnode.id,
          type: 'treeNode',
          position: { x: vnode.x, y: vnode.y },
          data: {
            label: vnode.label,
            kind: vnode.kind,
            shape: treePreferences.shape,
            active:
              vnode.meta?.id === activeNodeId ||
              Boolean(activeNodeId && vnode.cluster?.nodeIds.includes(activeNodeId)),
            preview:
              vnode.meta?.id === previewNodeId ||
              Boolean(previewNodeId && vnode.cluster?.nodeIds.includes(previewNodeId)),
            selected: vnode.meta
              ? selectedNodeIds.includes(vnode.meta.id)
              : (vnode.cluster?.nodeIds ?? []).some((id) => selectedNodeIds.includes(id)),
            dimmed: !isGroupBox && !mainPathIds.has(vnode.id) && !currentVnodeIds.has(vnode.id),
            mainPath: mainPathIds.has(vnode.id),
            archived: vnode.isArchived,
            collapsed: vnode.isCollapsed,
            childCount: vnode.childCount,
            status: vnode.meta?.assistantStatus ?? 'complete',
            versionLabel: vnode.versionLabel,
            summarizing: vnode.cluster ? clusterSummarizing.includes(vnode.cluster.id) : false,
            clusterSummary: vnode.cluster?.summary ?? null,
            groupBox: isGroupBox
          },
          draggable: false,
          connectable: false,
          selectable: !isGroupBox,
          zIndex: isGroupBox ? -1 : 0,
          style: isGroupBox
            ? { width: vnode.width ?? nodeSize.width, height: vnode.height ?? nodeSize.height }
            : { width: nodeSize.width, height: nodeSize.height }
        }
      }),
    [
      result,
      treePreferences.shape,
      activeNodeId,
      previewNodeId,
      selectedNodeIds,
      mainPathIds,
      currentVnodeIds,
      clusterSummarizing,
      nodeSize
    ]
  )

  const rfEdges = useMemo<Edge[]>(
    () =>
      result.edges.map((edge) => {
        const onCurrentPath = currentVnodeIds.has(edge.source) && currentVnodeIds.has(edge.target)
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: EDGE_TYPES[treePreferences.edge],
          style: edge.isMain
            ? { stroke: 'var(--mf-accent)', strokeWidth: 2.5 }
            : onCurrentPath
              ? { stroke: 'var(--mf-accent)', strokeWidth: 2 }
              : edge.isRegenerated
                ? { stroke: 'var(--mf-edge)', strokeDasharray: '4 3' }
                : { stroke: 'var(--mf-edge)' }
        }
      }),
    [result, treePreferences.edge, currentVnodeIds]
  )

  useEffect(() => {
    if (!instance) return
    instance.fitView({ padding: 0.25, duration: 200 })
  }, [instance, result, nodeSize])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => clearNotice(), 4000)
    return () => window.clearTimeout(timer)
  }, [notice, clearNotice])

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onInit={setInstance}
        onNodeClick={(_event, node) => {
          const vnode = result.nodes.find((item) => item.id === node.id)
          if (!vnode) return
          const now = Date.now()
          const last = lastClickRef.current
          const isDoubleClick = Boolean(last && last.id === node.id && now - last.at < 320)
          lastClickRef.current = { id: node.id, at: now }
          if (vnode.kind === 'cluster' && vnode.cluster) {
            if (isDoubleClick) {
              void setClusterCollapsed(vnode.cluster.id, false)
              return
            }
            const entry = vnode.cluster.nodeIds[0]
            if (entry) void openNode(entry, 'preview')
            return
          }
          void openNode(node.id, isDoubleClick ? 'enter' : 'preview')
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          const vnode = result.nodes.find((item) => item.id === node.id)
          if (vnode) setMenu({ vnode, x: event.clientX, y: event.clientY })
        }}
        onSelectionChange={(params) => {
          const ids: string[] = []
          for (const node of params.nodes) {
            const vnode = result.nodes.find((item) => item.id === node.id)
            if (!vnode) continue
            if (vnode.kind === 'cluster' && vnode.cluster) {
              ids.push(...vnode.cluster.nodeIds)
            } else {
              ids.push(node.id)
            }
          }
          const current = useAppStore.getState().selectedNodeIds
          const same =
            current.length === ids.length && ids.every((id, index) => current[index] === id)
          if (!same) setSelection(ids)
        }}
        onPaneClick={() => {
          setMenu(null)
          setPaneMenu(null)
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault()
          setPaneMenu({ x: event.clientX, y: event.clientY })
        }}
        onMoveStart={() => {
          setMenu(null)
          setPaneMenu(null)
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        selectionOnDrag={selectMode}
        panOnDrag={selectMode ? [1, 2] : true}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={['Control', 'Meta']}
        onlyRenderVisibleElements
        fitView
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-app"
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color={dotColor} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>

      {selectedNodeIds.length > 0 && !menu && (
        <div className="absolute left-3 top-3 z-30 flex items-center gap-2 rounded-lg border border-border bg-popover px-2 py-1.5 text-[11px] shadow-lg">
          <span className="text-fg-muted">已选 {selectedNodeIds.length} 个节点</span>
          <button
            type="button"
            onClick={() => void createClusterFromSelection()}
            className="flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-accent-fg hover:bg-accent-hover"
          >
            <Layers className="h-3 w-3" />
            创建主题
          </button>
          <button
            type="button"
            onClick={() => setSelection([])}
            className="rounded px-1.5 py-0.5 text-fg-subtle hover:bg-card-muted"
          >
            清除
          </button>
        </div>
      )}

      {notice && (
        <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1 rounded-lg border border-border bg-popover px-2 py-1 text-[11px] text-fg-muted shadow-lg">
          <Sparkles className="h-3 w-3 text-accent" />
          {notice}
        </div>
      )}

      {paneMenu && (
        <div
          style={{
            left: Math.min(paneMenu.x, window.innerWidth - 200),
            top: Math.min(paneMenu.y, window.innerHeight - 120)
          }}
          onMouseDown={(event) => event.stopPropagation()}
          className="fixed z-50 w-44 rounded-lg border border-border bg-popover py-1 shadow-xl"
        >
          {selectedNodeIds.length > 0 && (
            <button
              type="button"
              onClick={() => {
                void createClusterFromSelection()
                setPaneMenu(null)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-card-muted"
            >
              <Layers className="h-3.5 w-3.5" />
              创建主题（{selectedNodeIds.length} 个）
            </button>
          )}
          {selectedNodeIds.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelection([])
                setPaneMenu(null)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-card-muted"
            >
              清除选择
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              instance?.fitView({ padding: 0.25, duration: 200 })
              setPaneMenu(null)
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-card-muted"
          >
            适配视图
          </button>
        </div>
      )}

      {menu && (
        <NodeContextMenu
          vnode={menu.vnode}
          x={menu.x}
          y={menu.y}
          summarizing={Boolean(
            menu.vnode.cluster && clusterSummarizing.includes(menu.vnode.cluster.id)
          )}
          selectionCount={selectedNodeIds.length}
          onClose={() => setMenu(null)}
          onEnter={(vnode) => void openNode(vnode.id, 'enter')}
          onToggleCollapse={(vnode) => void setCollapsed(vnode.id, !vnode.isCollapsed)}
          onSetMain={(vnode) => void setMainBranch(vnode.id)}
          onToggleArchive={(vnode) => void setArchived(vnode.id, !vnode.isArchived)}
          onRegenerate={(vnode) => void regenerate(vnode.id)}
          onEdit={(vnode) =>
            setEditing({
              nodeId: vnode.id,
              value: vnode.meta?.userContent ?? '',
              syncGroup: false,
              showSync: Boolean(vnode.meta?.turnGroupId)
            })
          }
          onDelete={(vnode) => {
            if (window.confirm('删除该节点及其整个子树？可在回收站中恢复。')) {
              void deleteNode(vnode.id)
            }
          }}
          onRenameCluster={(clusterId, title) => setRenaming({ clusterId, value: title })}
          onSummarizeCluster={(clusterId) => void summarizeCluster(clusterId)}
          onToggleClusterCollapsed={(clusterId, collapsed) =>
            void setClusterCollapsed(clusterId, collapsed)
          }
          onEnterClusterEnd={(clusterId) => {
            const cluster = clusters.find((item) => item.id === clusterId)
            const last = cluster?.nodeIds[cluster.nodeIds.length - 1]
            if (last) void openNode(last, 'enter')
          }}
          onDissolveCluster={(clusterId) => {
            if (window.confirm('解散该主题？节点本身及其结构不会改变。')) {
              void deleteCluster(clusterId)
            }
          }}
          onCreateClusterFromSelection={() => void createClusterFromSelection()}
        />
      )}

      {renaming && (
        <TreeRenameDialog
          value={renaming.value}
          onChange={(value) => setRenaming({ clusterId: renaming.clusterId, value })}
          onCancel={() => setRenaming(null)}
          onConfirm={() => {
            const trimmed = renaming.value.trim()
            if (trimmed) void renameCluster(renaming.clusterId, trimmed)
            setRenaming(null)
          }}
        />
      )}

      {editing && (
        <NodeEditDialog
          value={editing.value}
          onChange={(value) => setEditing({ ...editing, value })}
          syncGroup={editing.syncGroup}
          onSyncGroupChange={(value) => setEditing({ ...editing, syncGroup: value })}
          showSync={editing.showSync}
          onCancel={() => setEditing(null)}
          onConfirm={() => {
            const trimmed = editing.value.trim()
            if (trimmed) void editNode(editing.nodeId, trimmed, editing.syncGroup)
            setEditing(null)
          }}
        />
      )}

      <DeletedNodesDialog open={deletedOpen} onClose={() => setDeletedOpen(false)} />

      <div className="absolute right-3 top-3 z-30 flex items-center gap-1">
        <button
          type="button"
          title={selectMode ? '退出选择模式' : '选择模式（左键拖拽框选）'}
          onClick={() => setSelectMode((value) => !value)}
          className={`rounded border border-border p-1.5 shadow-sm ${
            selectMode ? 'bg-accent/20 text-accent' : 'bg-card text-fg-subtle hover:text-fg'
          }`}
        >
          <MousePointerSquareDashed className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="回收站"
          onClick={() => setDeletedOpen(true)}
          className="rounded border border-border bg-card p-1.5 text-fg-subtle shadow-sm hover:text-fg"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export function TopicTreePanel() {
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const togglePanel = useAppStore((state) => state.togglePanel)
  const [fullscreen, setFullscreen] = useState(false)

  if (!activeProjectId) {
    return (
      <CardShell
        header={
          <>
            <h2 className="flex-1 text-xs font-medium text-fg-muted">主题对话树</h2>
            <button
              type="button"
              title="折叠面板"
              onClick={() => togglePanel('tree')}
              className="rounded p-1 text-fg-subtle hover:bg-card-muted hover:text-fg"
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </button>
          </>
        }
      >
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-fg-subtle">
          创建或选择一个项目后，这里会显示主题对话树。
        </div>
      </CardShell>
    )
  }

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-app text-fg">
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-2">
          <h2 className="text-xs font-medium text-fg-muted">主题对话树（全屏）</h2>
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
          <h2 className="flex-1 text-xs font-medium text-fg-muted">主题对话树</h2>
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
            title="折叠面板"
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
