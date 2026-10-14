import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { ChevronsLeft, ChevronsRight, Plus, X } from 'lucide-react'
import { useAppStore, type TabState } from '../../stores/appStore'

const TABS_WIDTH_KEY = 'mindforest.tabs.width'
const TABS_MIN_WIDTH = 120
const TABS_MAX_WIDTH = 320
const TABS_DEFAULT_WIDTH = 176

function clampTabsWidth(width: number): number {
  return Math.min(Math.max(Math.round(width), TABS_MIN_WIDTH), TABS_MAX_WIDTH)
}

function readTabsWidth(): number {
  try {
    const raw = Number(localStorage.getItem(TABS_WIDTH_KEY))
    if (Number.isFinite(raw) && raw > 0) return clampTabsWidth(raw)
  } catch {
    void 0
  }
  return TABS_DEFAULT_WIDTH
}

function persistTabsWidth(width: number): void {
  try {
    localStorage.setItem(TABS_WIDTH_KEY, String(width))
  } catch {
    void 0
  }
}

function compact(text: string, length = 24): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length > length ? `${trimmed.slice(0, length)}…` : trimmed
}

function TabButton({
  tab,
  active,
  orientation,
  dragging,
  dropBefore,
  onActivate,
  onClose,
  onContextMenu,
  onPointerDown
}: {
  tab: TabState
  active: boolean
  orientation: 'top' | 'left'
  dragging: boolean
  dropBefore: boolean
  onActivate: () => void
  onClose: () => void
  onContextMenu: (event: ReactMouseEvent) => void
  onPointerDown: (event: ReactPointerEvent) => void
}) {
  const projects = useAppStore((state) => state.projects)
  const project = projects.find((item) => item.id === tab.projectId)
  const focused = tab.nodes.find(
    (node) => node.id === (tab.previewNodeId ?? tab.activeNodeId)
  )
  const nodeLabel = focused ? compact(focused.title?.trim() || focused.userContent) : '空白标签页'
  const streaming = tab.streaming !== null

  const indicator =
    dropBefore ? (
      <span
        className={`pointer-events-none absolute rounded bg-accent ${
          orientation === 'top' ? 'inset-y-0 left-0 w-0.5' : 'inset-x-2 top-0 h-0.5'
        }`}
      />
    ) : null

  const handlePointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return
    onPointerDown(event)
  }

  if (orientation === 'left') {
    return (
      <div
        role="button"
        tabIndex={0}
        data-tab-id={tab.id}
        data-active={active ? 'true' : 'false'}
        onPointerDown={handlePointerDown}
        onClick={onActivate}
        onContextMenu={onContextMenu}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onActivate()
        }}
        className={`relative flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left ${
          active ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:bg-card-muted'
        } ${dragging ? 'opacity-40' : ''}`}
      >
        {indicator}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1 truncate text-xs">
            {streaming && (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
            )}
            <span className="truncate">{project?.name ?? '项目'}</span>
          </span>
          <span className="truncate text-[10px] text-fg-subtle">{nodeLabel}</span>
        </span>
        <button
          type="button"
          title="关闭标签页"
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          className="shrink-0 rounded p-0.5 text-fg-subtle hover:bg-card-muted hover:text-danger"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-tab-id={tab.id}
      data-active={active ? 'true' : 'false'}
      onPointerDown={handlePointerDown}
      onClick={onActivate}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onActivate()
      }}
      className={`group relative flex max-w-56 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 ${
        active
          ? 'border-accent/60 bg-accent/15 text-accent'
          : 'border-transparent text-fg-muted hover:bg-card-muted'
      } ${dragging ? 'opacity-40' : ''}`}
    >
      {indicator}
      {streaming && (
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
      )}
      <span className="min-w-0 truncate text-xs">{project?.name ?? '项目'}</span>
      <span className="hidden min-w-0 max-w-32 truncate text-[10px] text-fg-subtle md:inline">
        {nodeLabel}
      </span>
      <button
        type="button"
        title="关闭标签页"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        className="shrink-0 rounded p-0.5 text-fg-subtle hover:text-danger"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export function TabBar({ orientation }: { orientation: 'top' | 'left' }) {
  const tabs = useAppStore((state) => state.tabs)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const newTab = useAppStore((state) => state.newTab)
  const closeTab = useAppStore((state) => state.closeTab)
  const closeOtherTabs = useAppStore((state) => state.closeOtherTabs)
  const activateTab = useAppStore((state) => state.activateTab)
  const reorderTab = useAppStore((state) => state.reorderTab)
  const projects = useAppStore((state) => state.projects)
  const preferences = useAppStore((state) => state.preferences)
  const setPreferences = useAppStore((state) => state.setPreferences)
  const [menu, setMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const [width, setWidth] = useState(readTabsWidth)
  const [dragTabId, setDragTabId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const dropIndexRef = useRef<number | null>(null)
  const dragRef = useRef<{
    tabId: string
    index: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const ui = preferences.ui
  const collapsed = orientation === 'left' && ui.tabsCollapsed

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  if (projects.length === 0) return null

  const setCollapsed = (value: boolean) => {
    void setPreferences({ ui: { ...ui, tabsCollapsed: value } })
  }

  const startResize = (event: ReactPointerEvent) => {
    event.preventDefault()
    dragRef.current = null
    const startX = event.clientX
    const startWidth = width
    const onMove = (moveEvent: PointerEvent) => {
      setWidth(clampTabsWidth(startWidth + (moveEvent.clientX - startX)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setWidth((current) => {
        const next = clampTabsWidth(current)
        persistTabsWidth(next)
        return next
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const resetWidth = () => {
    setWidth(TABS_DEFAULT_WIDTH)
    persistTabsWidth(TABS_DEFAULT_WIDTH)
  }

  const beginTabDrag = (event: ReactPointerEvent, tabId: string, index: number) => {
    const drag = { tabId, index, startX: event.clientX, startY: event.clientY, moved: false }
    dragRef.current = drag
    const onMove = (moveEvent: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      if (!current.moved) {
        const distance = Math.hypot(
          moveEvent.clientX - current.startX,
          moveEvent.clientY - current.startY
        )
        if (distance < 6) return
        current.moved = true
        suppressClickRef.current = true
        setDragTabId(current.tabId)
      }
      const rects = Array.from(
        document.querySelectorAll<HTMLElement>('[data-tab-id]')
      ).filter((element) => element.offsetParent !== null)
      const axis = orientation === 'top' ? 'clientX' : 'clientY'
      let index = rects.length
      for (let i = 0; i < rects.length; i += 1) {
        const rect = rects[i]!.getBoundingClientRect()
        const middle =
          orientation === 'top' ? rect.left + rect.width / 2 : rect.top + rect.height / 2
        if (moveEvent[axis] < middle) {
          index = i
          break
        }
      }
      dropIndexRef.current = index
      setDropIndex(index)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const current = dragRef.current
      dragRef.current = null
      const target = dropIndexRef.current
      dropIndexRef.current = null
      setDragTabId(null)
      setDropIndex(null)
      if (current?.moved) {
        if (target !== null) {
          const adjusted = target > current.index ? target - 1 : target
          reorderTab(current.tabId, adjusted)
        }
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      } else {
        suppressClickRef.current = false
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const activate = (tabId: string) => {
    if (suppressClickRef.current) return
    void activateTab(tabId)
  }

  const plusButton = (
    <button
      type="button"
      title="新建标签页（Ctrl+T）"
      onClick={() => void newTab()}
      className={`flex shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-card-muted hover:text-fg ${
        orientation === 'left' ? 'w-full gap-1 px-2 py-1.5 text-xs' : 'h-6.5 w-6.5 p-1'
      }`}
    >
      <Plus className="h-3.5 w-3.5" />
      {orientation === 'left' && '新建标签页'}
    </button>
  )

  const menuOverlay = menu ? (
    <div
      style={{
        left: Math.min(menu.x, window.innerWidth - 180),
        top: Math.min(menu.y, window.innerHeight - 100)
      }}
      onMouseDown={(event) => event.stopPropagation()}
      className="fixed z-50 w-40 rounded-lg border border-border bg-popover py-1 shadow-xl"
    >
      <button
        type="button"
        onClick={() => {
          void closeTab(menu.tabId)
          setMenu(null)
        }}
        className="flex w-full items-center px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-card-muted"
      >
        关闭标签页
      </button>
      <button
        type="button"
        onClick={() => {
          void closeOtherTabs(menu.tabId)
          setMenu(null)
        }}
        className="flex w-full items-center px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-card-muted"
      >
        关闭其他标签页
      </button>
    </div>
  ) : null

  if (orientation === 'top') {
    return (
      <>
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-card-muted/40 px-2 py-1">
          {tabs.map((tab, index) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={tab.id === activeTabId}
              orientation="top"
              dragging={dragTabId === tab.id}
              dropBefore={dropIndex === index && dragTabId !== null}
              onActivate={() => activate(tab.id)}
              onClose={() => void closeTab(tab.id)}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({ tabId: tab.id, x: event.clientX, y: event.clientY })
              }}
              onPointerDown={(event) => beginTabDrag(event, tab.id, index)}
            />
          ))}
          {plusButton}
        </div>
        {menuOverlay}
      </>
    )
  }

  if (collapsed) {
    return (
      <>
        <aside
          id="tabbar"
          className="flex w-8 shrink-0 flex-col items-center gap-1 border-r border-border bg-card-muted/40 py-1.5"
        >
          <button
            type="button"
            title="展开标签页"
            onClick={() => setCollapsed(false)}
            className="rounded p-1 text-fg-subtle hover:bg-card-muted hover:text-fg"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
          {tabs.map((tab) => {
            const project = projects.find((item) => item.id === tab.projectId)
            const active = tab.id === activeTabId
            return (
              <button
                key={tab.id}
                type="button"
                data-tab-id={tab.id}
                data-active={active ? 'true' : 'false'}
                title={project?.name ?? '项目'}
                onClick={() => activate(tab.id)}
                className={`relative flex h-7 w-7 items-center justify-center rounded text-[11px] ${
                  active ? 'bg-accent/20 text-accent' : 'text-fg-muted hover:bg-card-muted'
                }`}
              >
                {(project?.name ?? '项').slice(0, 1)}
                {tab.streaming && (
                  <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                )}
              </button>
            )
          })}
        </aside>
        {menuOverlay}
      </>
    )
  }

  return (
    <>
      <aside
        id="tabbar"
        style={{ width }}
        className="relative flex shrink-0 flex-col gap-1 border-r border-border bg-card-muted/40 p-2"
      >
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-[10px] font-medium text-fg-subtle">标签页</span>
          <button
            type="button"
            title="折叠标签页"
            onClick={() => setCollapsed(true)}
            className="rounded p-0.5 text-fg-subtle hover:bg-card-muted hover:text-fg"
          >
            <ChevronsLeft className="h-3 w-3" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {tabs.map((tab, index) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={tab.id === activeTabId}
              orientation="left"
              dragging={dragTabId === tab.id}
              dropBefore={dropIndex === index && dragTabId !== null}
              onActivate={() => activate(tab.id)}
              onClose={() => void closeTab(tab.id)}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({ tabId: tab.id, x: event.clientX, y: event.clientY })
              }}
              onPointerDown={(event) => beginTabDrag(event, tab.id, index)}
            />
          ))}
        </div>
        {plusButton}
        <div
          onPointerDown={startResize}
          onDoubleClick={resetWidth}
          title="拖动调整标签栏宽度，双击恢复默认"
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-accent/40"
        />
      </aside>
      {menuOverlay}
    </>
  )
}
