import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CornerDownLeft,
  DatabaseBackup,
  FolderOpen,
  Moon,
  Plus,
  Search,
  Settings
} from 'lucide-react'
import type { SearchResult } from '@shared/types'
import { useAppStore, useEffectiveMode } from '../stores/appStore'

interface QuickAction {
  id: string
  label: string
  hint: string
  icon: typeof Plus
  run: () => void | Promise<void>
}

function Highlighted({ result }: { result: SearchResult }) {
  const { snippet, matchStart, matchLength } = result
  if (!matchLength || matchStart < 0 || matchStart >= snippet.length) return <>{snippet}</>
  const before = snippet.slice(0, matchStart)
  const match = snippet.slice(matchStart, matchStart + matchLength)
  const after = snippet.slice(matchStart + matchLength)
  return (
    <>
      {before}
      <mark className="rounded bg-accent/20 px-0.5 text-accent">{match}</mark>
      {after}
    </>
  )
}

export function SearchDialog({
  open,
  onClose,
  onOpenSettings
}: {
  open: boolean
  onClose: () => void
  onOpenSettings: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const openSearchResult = useAppStore((state) => state.openSearchResult)
  const newTab = useAppStore((state) => state.newTab)
  const setPreferences = useAppStore((state) => state.setPreferences)
  const mode = useEffectiveMode()

  const quickActions = useMemo<QuickAction[]>(
    () => [
      {
        id: 'new-tab',
        label: '新建标签页',
        hint: 'Ctrl+T',
        icon: Plus,
        run: () => newTab()
      },
      {
        id: 'settings',
        label: '打开设置',
        hint: 'Ctrl+K',
        icon: Settings,
        run: onOpenSettings
      },
      {
        id: 'theme',
        label: mode === 'dark' ? '切换到亮色模式' : '切换到暗色模式',
        hint: '外观',
        icon: Moon,
        run: () => setPreferences({ mode: mode === 'dark' ? 'light' : 'dark' })
      },
      {
        id: 'backup',
        label: '立即备份数据库',
        hint: '数据',
        icon: DatabaseBackup,
        run: async () => {
          const backup = await window.mindforest.app.backupNow()
          window.alert(`备份已创建：${backup.filePath}`)
        }
      },
      {
        id: 'backups-dir',
        label: '打开备份目录',
        hint: '数据',
        icon: FolderOpen,
        run: () => window.mindforest.app.openBackupsDir()
      }
    ],
    [mode, newTab, onOpenSettings, setPreferences]
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    setResults([])
    setActiveIndex(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    let alive = true
    const timer = window.setTimeout(() => {
      void window.mindforest.search
        .query({ query: trimmed, limit: 30 })
        .then((items) => {
          if (!alive) return
          setResults(items)
          setActiveIndex(0)
        })
        .catch(() => {
          if (alive) setResults([])
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }, 150)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [open, query])

  if (!open) return null

  const runQuickAction = (action: QuickAction) => {
    onClose()
    void action.run()
  }

  const activate = (index: number) => {
    if (query.trim()) {
      const result = results[index]
      if (!result) return
      onClose()
      void openSearchResult(result)
      return
    }
    const action = quickActions[index]
    if (action) runQuickAction(action)
  }

  const total = query.trim() ? results.length : quickActions.length

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-[640px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 text-fg-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
                return
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                if (total > 0) setActiveIndex((index) => (index + 1) % total)
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                if (total > 0) setActiveIndex((index) => (index - 1 + total) % total)
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                activate(activeIndex)
              }
            }}
            placeholder="搜索所有项目的对话、标题与回答…"
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-subtle">
            Esc
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {query.trim() ? (
            <>
              {loading && <p className="px-3 py-2 text-[11px] text-fg-subtle">正在搜索…</p>}
              {!loading && results.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-fg-subtle">没有找到匹配的对话</p>
              )}
              {results.map((result, index) => (
                <button
                  key={result.nodeId}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => activate(index)}
                  className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left ${
                    index === activeIndex ? 'bg-accent/15' : 'hover:bg-card-muted'
                  }`}
                >
                  <span className="flex items-center gap-2 text-xs text-fg">
                    <span className="truncate">{result.title?.trim() || '(无标题)'}</span>
                    <span className="shrink-0 rounded bg-card-muted px-1 text-[10px] text-fg-subtle">
                      {result.projectName}
                    </span>
                    <span className="shrink-0 text-[10px] text-fg-subtle">
                      {result.matchedField === 'title'
                        ? '标题'
                        : result.matchedField === 'user'
                          ? '提问'
                          : '回答'}
                    </span>
                    <span className="flex-1" />
                    {index === activeIndex && (
                      <span className="flex items-center gap-1 text-[10px] text-fg-subtle">
                        <CornerDownLeft className="h-3 w-3" />
                        打开
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 text-[11px] leading-relaxed text-fg-muted">
                    <Highlighted result={result} />
                  </span>
                </button>
              ))}
            </>
          ) : (
            <>
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-fg-subtle">
                快捷操作
              </p>
              {quickActions.map((action, index) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runQuickAction(action)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${
                      index === activeIndex
                        ? 'bg-accent/15 text-accent'
                        : 'text-fg-muted hover:bg-card-muted'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{action.label}</span>
                    <span className="flex-1" />
                    <span className="text-[10px] text-fg-subtle">{action.hint}</span>
                  </button>
                )
              })}
            </>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[10px] text-fg-subtle">
          <span>↑↓ 选择</span>
          <span>↵ 打开</span>
          <span>Esc 关闭</span>
          <span className="flex-1" />
          <span>Ctrl+P</span>
        </div>
      </div>
    </div>
  )
}
