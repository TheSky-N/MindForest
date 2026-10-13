import { useEffect, useMemo } from 'react'
import {
  Group,
  Panel,
  Separator,
  usePanelRef,
  type Layout
} from 'react-resizable-panels'
import { LAYOUT_STORAGE_KEY, useAppStore } from '../../stores/appStore'
import { Sidebar } from '../Sidebar'
import { ChatPanel } from '../ChatPanel'
import { TopicTreePanel } from '../TopicTreePanel'

function readStoredLayout(): Layout | undefined {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, unknown>)
      if (entries.length > 0 && entries.every(([, value]) => typeof value === 'number')) {
        return parsed as Layout
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

function ResizeHandle({ collapsed }: { collapsed: boolean }) {
  return (
    <Separator
      className={`mx-0.5 w-1.5 rounded-full transition-colors ${
        collapsed ? 'pointer-events-none opacity-0' : 'bg-transparent hover:bg-accent/40'
      }`}
    />
  )
}

export function ResizableLayout() {
  const layoutVersion = useAppStore((state) => state.layoutVersion)
  const collapsed = useAppStore((state) => state.panelsCollapsed)
  const setPanelCollapsed = useAppStore((state) => state.setPanelCollapsed)

  const sidebarRef = usePanelRef()
  const treeRef = usePanelRef()

  const stored = useMemo(() => {
    void layoutVersion
    return readStoredLayout()
  }, [layoutVersion])

  useEffect(() => {
    const ref = sidebarRef.current
    if (!ref) return
    if (collapsed.sidebar) ref.collapse()
    else ref.expand()
  }, [collapsed.sidebar, sidebarRef])

  useEffect(() => {
    const ref = treeRef.current
    if (!ref) return
    if (collapsed.tree) ref.collapse()
    else ref.expand()
  }, [collapsed.tree, treeRef])

  return (
    <Group
      key={layoutVersion}
      id="mindforest-layout"
      orientation="horizontal"
      className="h-full px-2 pb-2 pt-2"
      defaultLayout={stored}
      onLayoutChanged={(layout, meta) => {
        const next = meta.requestedLayout ?? layout
        const hasCollapsedPanel = Object.values(next).some((value) => value <= 0.01)
        if (hasCollapsedPanel) return
        try {
          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next))
        } catch {
          void 0
        }
      }}
    >
      <Panel
        id="sidebar"
        panelRef={sidebarRef}
        collapsible
        collapsedSize={0}
        minSize="14%"
        maxSize="42%"
        defaultSize="18%"
        onResize={(size) => setPanelCollapsed('sidebar', size.asPercentage <= 0.01)}
      >
        <Sidebar />
      </Panel>
      <ResizeHandle collapsed={collapsed.sidebar} />
      <Panel id="chat" minSize="30%" defaultSize="57%">
        <ChatPanel />
      </Panel>
      <ResizeHandle collapsed={collapsed.tree} />
      <Panel
        id="tree"
        panelRef={treeRef}
        collapsible
        collapsedSize={0}
        minSize="14%"
        maxSize="42%"
        defaultSize="25%"
        onResize={(size) => setPanelCollapsed('tree', size.asPercentage <= 0.01)}
      >
        <TopicTreePanel />
      </Panel>
    </Group>
  )
}
