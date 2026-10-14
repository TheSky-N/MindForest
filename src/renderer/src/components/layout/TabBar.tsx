import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { useAppStore, type TabState } from '../../stores/appStore'

function compact(text: string, length = 24): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length > length ? `${trimmed.slice(0, length)}…` : trimmed
}

function TabButton({
  tab,
  active,
  orientation,
  onActivate,
  onClose,
  onContextMenu
}: {
  tab: TabState
  active: boolean
  orientation: 'top' | 'left'
  onActivate: () => void
  onClose: () => void
  onContextMenu: (event: ReactMouseEvent) => void
}) {
  const projects = useAppStore((state) => state.projects)
  const project = projects.find((item) => item.id === tab.projectId)
  const focused = tab.nodes.find(
    (node) => node.id === (tab.previewNodeId ?? tab.activeNodeId)
  )
  const nodeLabel = focused ? compact(focused.userContent) : '空白标签页'
  const streaming = tab.streaming !== null

  if (orientation === 'left') {
    return (
      <div
        role="button"
        tabIndex={0}
        data-tab-id={tab.id}
        data-active={active ? 'true' : 'false'}
        onClick={onActivate}
        onContextMenu={onContextMenu}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onActivate()
        }}
        onAuxClick={(event) => {
          if (event.button === 1) onClose()
        }}
        className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left ${
          active ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:bg-card-muted'
        }`}
      >
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
          className="hidden shrink-0 rounded p-0.5 text-fg-subtle hover:bg-card-muted hover:text-danger group-hover:block"
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
      onClick={onActivate}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onActivate()
      }}
      onAuxClick={(event) => {
        if (event.button === 1) onClose()
      }}
      className={`group flex max-w-56 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 ${
        active
          ? 'border-accent/60 bg-accent/15 text-accent'
          : 'border-transparent text-fg-muted hover:bg-card-muted'
      }`}
    >
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
        className="hidden shrink-0 rounded p-0.5 text-fg-subtle hover:text-danger group-hover:block"
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
  const projects = useAppStore((state) => state.projects)
  const [menu, setMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const projectCount = projects.length

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

  if (projectCount === 0) return null

  const plusButton = (
    <button
      type="button"
      title="新建标签页（Ctrl+T）"
      disabled={projectCount === 0}
      onClick={() => void newTab()}
      className={`flex shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-card-muted hover:text-fg ${
        orientation === 'left' ? 'w-full gap-1 px-2 py-1.5 text-xs' : 'h-6.5 w-6.5 p-1'
      }`}
    >
      <Plus className="h-3.5 w-3.5" />
      {orientation === 'left' && '新建标签页'}
    </button>
  )

  return (
    <>
      {orientation === 'top' ? (
        <div className="mx-2 mt-2 flex shrink-0 items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card px-2 py-1">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={tab.id === activeTabId}
              orientation="top"
              onActivate={() => void activateTab(tab.id)}
              onClose={() => void closeTab(tab.id)}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({ tabId: tab.id, x: event.clientX, y: event.clientY })
              }}
            />
          ))}
          {plusButton}
        </div>
      ) : (
        <aside
          id="tabbar"
          className="flex w-44 shrink-0 flex-col gap-1 border-r border-border bg-card p-2"
        >
          <div className="px-1 pb-1 text-[10px] font-medium text-fg-subtle">标签页</div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {tabs.map((tab) => (
              <TabButton
                key={tab.id}
                tab={tab}
                active={tab.id === activeTabId}
                orientation="left"
                onActivate={() => void activateTab(tab.id)}
                onClose={() => void closeTab(tab.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenu({ tabId: tab.id, x: event.clientX, y: event.clientY })
                }}
              />
            ))}
          </div>
          {plusButton}
        </aside>
      )}

      {menu && (
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
      )}
    </>
  )
}
