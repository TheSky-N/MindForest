import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent
} from 'react'
import {
  ArrowRightToLine,
  Check,
  ChevronDown,
  Copy,
  Download,
  Pencil,
  RefreshCw,
  Trash2
} from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'
import type { HistoryExportFormat, NodePathEntry } from '@shared/types'
import { useAppStore, EMPTY_TAB, type TabState } from '../stores/appStore'
import { Markdown } from './Markdown'
import { CardShell } from './layout/CardShell'
import { TabBar } from './layout/TabBar'

type TabSlice = { tabs: TabState[]; activeTabId: string | null }

function selectActiveTabState(state: TabSlice): TabState {
  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? EMPTY_TAB
}

const COMPOSER_HEIGHT_KEY = 'mindforest.composer.height'
const COMPOSER_MIN_HEIGHT = 48
const COMPOSER_DEFAULT_HEIGHT = 64

function clampComposerHeight(height: number): number {
  const max = Math.max(160, Math.round(window.innerHeight * 0.6))
  return Math.min(Math.max(Math.round(height), COMPOSER_MIN_HEIGHT), max)
}

function readStoredComposerHeight(): number {
  try {
    const raw = Number(localStorage.getItem(COMPOSER_HEIGHT_KEY))
    if (Number.isFinite(raw) && raw > 0) return clampComposerHeight(raw)
  } catch {
    void 0
  }
  return COMPOSER_DEFAULT_HEIGHT
}

function persistComposerHeight(height: number): void {
  try {
    localStorage.setItem(COMPOSER_HEIGHT_KEY, String(height))
  } catch {
    void 0
  }
}

function lineClampStyle(lines: number): CSSProperties {
  const lineHeight = 1.625
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    lineHeight,
    maxHeight: `${lines * lineHeight}em`,
    overflow: 'hidden'
  }
}

interface QuoteSelection {
  nodeId: string
  text: string
  x: number
  y: number
}

function truncate(text: string, length = 18): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length > length ? `${trimmed.slice(0, length)}…` : trimmed
}

function formatTokenCount(value: number | null): string {
  if (value === null) return '?'
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
}

function NodeTurn({
  entry,
  focused,
  streaming,
  streamContent,
  versionLabel,
  onQuote
}: {
  entry: NodePathEntry
  focused: boolean
  streaming: boolean
  streamContent: string
  versionLabel: string | null
  onQuote: (selection: QuoteSelection) => void
}) {
  const regenerate = useAppStore((state) => state.regenerate)
  const deleteNode = useAppStore((state) => state.deleteNode)
  const editNode = useAppStore((state) => state.editNode)
  const editNodeBranchAndSend = useAppStore((state) => state.editNodeBranchAndSend)
  const toggleAnswerCollapsed = useAppStore((state) => state.toggleAnswerCollapsed)
  const setUserCollapsed = useAppStore((state) => state.setUserCollapsed)
  const foldLines = useAppStore((state) => state.preferences.chat.foldLines)
  const renderUserMarkdown = useAppStore((state) => state.preferences.chat.renderUserMarkdown)
  const renderAssistantMarkdown = useAppStore(
    (state) => state.preferences.chat.renderAssistantMarkdown
  )
  const groupCount = useAppStore(
    (state) =>
      entry.turnGroupId
        ? selectActiveTabState(state).nodes.filter(
            (node) => node.turnGroupId === entry.turnGroupId && !node.deletedAt
          ).length
        : 1
  )
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.userContent)
  const [syncGroup, setSyncGroup] = useState(false)
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null)
  const [userOverflow, setUserOverflow] = useState(false)
  const [copied, setCopied] = useState<'user' | 'answer' | null>(null)
  const userMeasureRef = useRef<HTMLDivElement | null>(null)
  const busy = useAppStore((state) => selectActiveTabState(state).streaming !== null)

  const copyMessage = async (kind: 'user' | 'answer', text: string) => {
    try {
      await window.mindforest.app.copyText(text)
      setCopied(kind)
      window.setTimeout(
        () => setCopied((current) => (current === kind ? null : current)),
        1500
      )
    } catch {
      void 0
    }
  }

  useEffect(() => {
    setDraft(entry.userContent)
  }, [entry.userContent])

  useEffect(() => {
    if (!selection) return
    const clear = () => setSelection(null)
    window.addEventListener('scroll', clear, true)
    return () => window.removeEventListener('scroll', clear, true)
  }, [selection])

  useLayoutEffect(() => {
    const element = userMeasureRef.current
    if (!element) return
    const measure = () => setUserOverflow(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [entry.userContent, foldLines, editing])

  const handleMouseUp = () => {
    if (editing) return
    const current = window.getSelection()
    const text = current?.toString().trim() ?? ''
    if (!current || current.isCollapsed || !text) {
      setSelection(null)
      return
    }
    const range = current.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    setSelection({ text, x: rect.left + rect.width / 2, y: rect.top })
  }

  const commitEdit = async () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    setEditing(false)
    setDraft(trimmed)
    await editNodeBranchAndSend(entry.id, trimmed)
  }

  const overwriteEdit = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === entry.userContent) {
      setEditing(false)
      setDraft(entry.userContent)
      return
    }
    const confirmed = window.confirm(
      '覆盖修改将删除该节点的全部子节点（可在回收站恢复）。继续？'
    )
    if (!confirmed) return
    await editNode(entry.id, trimmed, syncGroup)
    setEditing(false)
  }

  const assistantContent = streaming ? streamContent : entry.assistantContent
  const hasAnswer = assistantContent.trim().length > 0
  const folded = !streaming && entry.answerCollapsed && hasAnswer
  const userFolded =
    !editing && (entry.userCollapsed === true || (entry.userCollapsed === null && userOverflow))
  const hasTokens = !streaming && (entry.promptTokens !== null || entry.completionTokens !== null)
  const tokenTitle = hasTokens
    ? `输入 ${entry.promptTokens ?? '未知'} tok · 输出 ${entry.completionTokens ?? '未知'} tok · 合计 ${
        (entry.promptTokens ?? 0) + (entry.completionTokens ?? 0)
      } tok`
    : ''

  return (
    <div className="group flex flex-col" data-turn-id={entry.id}>
      {entry.quotes.length > 0 && (
        <div className="mb-1 flex flex-col items-end gap-1">
          {entry.quotes.map((quote) => (
            <blockquote
              key={quote.id}
              className="max-w-[85%] rounded border-l-2 border-accent/60 bg-card-muted px-2 py-1 text-[11px] text-fg-muted"
            >
              <span className="line-clamp-4 whitespace-pre-wrap">{quote.quoteText}</span>
            </blockquote>
          ))}
        </div>
      )}

      {editing ? (
        <div className="ml-auto w-full max-w-[85%]">
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                void commitEdit()
              }
            }}
            className="w-full resize-none rounded-lg border border-accent bg-app px-3 py-2 text-sm outline-none"
          />
          {groupCount > 1 && (
            <label className="mt-1 flex items-center gap-2 text-[11px] text-fg-muted">
              <input
                type="checkbox"
                checked={syncGroup}
                onChange={(event) => setSyncGroup(event.target.checked)}
              />
              覆盖修改时同步更新同组的其他回答版本
            </label>
          )}
          <div className="mt-1 flex items-center justify-end gap-2 text-[11px]">
            <span className="mr-auto text-[10px] text-fg-subtle">
              新开分支会保留当前分支并重新生成（Ctrl+Enter）
            </span>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setDraft(entry.userContent)
              }}
              className="rounded px-2 py-1 text-fg-muted hover:bg-card-muted"
            >
              取消
            </button>
            <button
              type="button"
              title="删除该节点的全部子节点（可在回收站恢复）"
              onClick={() => void overwriteEdit()}
              className="rounded border border-warning/50 px-2 py-1 text-warning hover:bg-warning/10"
            >
              覆盖修改
            </button>
            <button
              type="button"
              onClick={() => void commitEdit()}
              className="rounded bg-accent px-2 py-1 text-accent-fg hover:bg-accent-hover"
            >
              新开分支并发送
            </button>
          </div>
        </div>
      ) : (
        <div className="ml-auto w-full max-w-[85%]">
          <div className="relative">
            <div className="absolute -left-7 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                title="复制消息（Markdown）"
                onClick={() => void copyMessage('user', entry.userContent)}
                className="rounded p-0.5 text-fg-subtle hover:bg-card-muted hover:text-accent"
              >
                {copied === 'user' ? (
                  <Check className="h-3.5 w-3.5 text-accent" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <div
              ref={userMeasureRef}
              aria-hidden
              style={lineClampStyle(foldLines)}
              className="invisible pointer-events-none absolute inset-x-0 top-0 whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed"
            >
              {entry.userContent}
            </div>
            <div
              data-user-bubble
              onClick={userFolded ? () => void setUserCollapsed(entry.id, false) : undefined}
              title={userFolded ? '点击展开' : undefined}
              style={{ fontSize: 'var(--chat-font-size, 14px)' }}
              className={`rounded-lg bg-bubble-user px-3 py-2 leading-relaxed text-bubble-user-fg ${
                userFolded ? 'cursor-pointer' : ''
              }`}
            >
              <div
                style={userFolded ? lineClampStyle(foldLines) : undefined}
                className={renderUserMarkdown && !userFolded ? '' : 'whitespace-pre-wrap'}
              >
                {renderUserMarkdown && !userFolded ? (
                  <div className="[&_*]:!text-inherit">
                    <Markdown compact content={entry.userContent} />
                  </div>
                ) : (
                  entry.userContent
                )}
              </div>
            </div>
          </div>
          {(userFolded || userOverflow) && (
            <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-fg-subtle">
              {userFolded ? (
                <>
                  <span>已折叠 · {foldLines} 行预览</span>
                  <button
                    type="button"
                    onClick={() => void setUserCollapsed(entry.id, false)}
                    className="hover:text-accent"
                  >
                    展开
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void setUserCollapsed(entry.id, true)}
                  className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent"
                >
                  折叠消息
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div
        onMouseUp={handleMouseUp}
        data-answer
        style={{ fontSize: 'var(--chat-font-size, 14px)' }}
        className="mt-1 w-full rounded-lg border border-border/60 bg-bubble-ai px-4 py-3 leading-relaxed text-fg"
      >
        {folded ? (
          <div
            role="button"
            tabIndex={0}
            title="展开回答"
            onClick={() => void toggleAnswerCollapsed(entry.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void toggleAnswerCollapsed(entry.id)
            }}
            className="w-full cursor-pointer text-left"
          >
            <div
              style={{ ...lineClampStyle(foldLines), fontSize: '0.95em' }}
              className="whitespace-pre-wrap leading-relaxed text-fg-muted"
            >
              {assistantContent}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-fg-subtle">
              <span>已折叠 · {foldLines} 行预览 · 点击展开</span>
              <button
                type="button"
                title="复制回答（Markdown）"
                onClick={(event) => {
                  event.stopPropagation()
                  void copyMessage('answer', assistantContent)
                }}
                className="hover:text-accent"
              >
                {copied === 'answer' ? (
                  <Check className="h-3 w-3 text-accent" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
        ) : (
          <>
            {!streaming && hasAnswer && (
              <div className="-mt-1 -mr-1 mb-1 flex justify-end gap-1">
                <button
                  type="button"
                  title="复制回答（Markdown）"
                  onClick={() => void copyMessage('answer', assistantContent)}
                  className="rounded p-0.5 text-fg-subtle hover:bg-card-muted hover:text-accent"
                >
                  {copied === 'answer' ? (
                    <Check className="h-3.5 w-3.5 text-accent" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  title="折叠回答"
                  onClick={() => void toggleAnswerCollapsed(entry.id)}
                  className="rounded p-0.5 text-fg-subtle hover:bg-card-muted hover:text-fg"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {assistantContent ? (
              renderAssistantMarkdown ? (
                <Markdown content={assistantContent} streaming={streaming} />
              ) : (
                <div className="whitespace-pre-wrap leading-relaxed">{assistantContent}</div>
              )
            ) : (
              <span className="text-xs text-fg-subtle">
                {streaming ? '正在生成…' : '（空回复）'}
              </span>
            )}
            {entry.assistantStatus === 'error' && entry.assistantError && (
              <p className="mt-2 text-xs text-danger">生成失败：{entry.assistantError}</p>
            )}
            {entry.assistantStatus === 'aborted' && (
              <p className="mt-2 text-xs text-warning">已停止生成</p>
            )}
          </>
        )}
      </div>

      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-fg-subtle">
        {versionLabel && (
          <span className="rounded bg-card-muted px-1 text-fg-muted">{versionLabel}</span>
        )}
        {entry.model && <span>{entry.model}</span>}
        {hasTokens && (
          <span title={tokenTitle}>
            ↑{formatTokenCount(entry.promptTokens)} ↓{formatTokenCount(entry.completionTokens)} tok
          </span>
        )}
        <span className="min-w-0 flex-1" />
        <div className="flex min-w-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="truncate">{truncate(entry.userContent, 12)}</span>
          {focused && !streaming && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void regenerate(entry.id)}
              className="flex items-center gap-0.5 hover:enabled:text-accent disabled:opacity-30"
            >
              <RefreshCw className="h-3 w-3" />
              重新生成
            </button>
          )}
          {focused && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-0.5 hover:text-accent"
            >
              <Pencil className="h-3 w-3" />
              编辑
            </button>
          )}
          {focused && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('删除该节点及其整个子树？可在回收站中恢复。')) {
                  void deleteNode(entry.id)
                }
              }}
              className="flex items-center gap-0.5 hover:text-danger"
            >
              <Trash2 className="h-3 w-3" />
              删除节点
            </button>
          )}
        </div>
      </div>

      {selection && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onQuote({ nodeId: entry.id, text: selection.text, x: selection.x, y: selection.y })
            window.getSelection()?.removeAllRanges()
            setSelection(null)
          }}
          style={{ left: selection.x, top: selection.y - 8 }}
          className="fixed z-40 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-accent shadow-lg hover:bg-card-muted"
        >
          引用
        </button>
      )}
    </div>
  )
}

function PathList() {
  const pathNodes = useAppStore((state) => selectActiveTabState(state).pathNodes)
  const previewNodeId = useAppStore((state) => selectActiveTabState(state).previewNodeId)
  const activeNodeId = useAppStore((state) => selectActiveTabState(state).activeNodeId)
  const streaming = useAppStore((state) => selectActiveTabState(state).streaming)
  const streamContent = useAppStore((state) => selectActiveTabState(state).streamContent)
  const allNodes = useAppStore((state) => selectActiveTabState(state).nodes)
  const viewMode = useAppStore((state) => state.preferences.chat.viewMode)
  const addPendingQuote = useAppStore((state) => state.addPendingQuote)

  const focusedNodeId = previewNodeId ?? activeNodeId
  const focusedEntry = pathNodes.find((entry) => entry.id === focusedNodeId)

  const data = useMemo(
    () =>
      viewMode === 'single'
        ? focusedEntry && focusedEntry.id !== streaming?.nodeId
          ? [focusedEntry]
          : []
        : pathNodes.filter((entry) => entry.id !== streaming?.nodeId),
    [viewMode, focusedEntry, pathNodes, streaming]
  )
  const streamingEntry = streaming
    ? pathNodes.find((entry) => entry.id === streaming.nodeId)
    : undefined

  const versionLabelOf = (entry: NodePathEntry): string | null => {
    if (!entry.turnGroupId) return null
    const group = allNodes
      .filter((node) => node.turnGroupId === entry.turnGroupId && !node.deletedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    if (group.length <= 1) return null
    const index = group.findIndex((node) => node.id === entry.id)
    return `v${index + 1}/${group.length}`
  }

  const quoteSelection = (selection: QuoteSelection) =>
    addPendingQuote({ quotedNodeId: selection.nodeId, quoteText: selection.text })

  if (pathNodes.length === 0 && !streamingEntry) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-fg-subtle">
        {viewMode === 'single'
          ? '单击树上的节点可以查看该轮对话，双击进入并从那里继续。'
          : '单击树上的节点可以预览整条对话路径，双击进入并从那里继续。'}
      </div>
    )
  }

  if (viewMode === 'single') {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {data.map((entry) => (
          <div key={entry.id} className="mx-auto max-w-3xl px-4 pt-3">
            <NodeTurn
              entry={entry}
              focused={entry.id === focusedNodeId}
              streaming={false}
              streamContent=""
              versionLabel={versionLabelOf(entry)}
              onQuote={quoteSelection}
            />
          </div>
        ))}
        {streamingEntry && (
          <div className="mx-auto max-w-3xl px-4 pb-4 pt-3">
            <NodeTurn
              entry={{ ...streamingEntry, assistantContent: '', assistantStatus: 'streaming' }}
              focused
              streaming
              streamContent={streamContent}
              versionLabel={versionLabelOf(streamingEntry)}
              onQuote={quoteSelection}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1">
      <Virtuoso
        key={pathNodes[0]?.id ?? 'empty'}
        data={data}
        computeItemKey={(_, entry) => entry.id}
        followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
        initialTopMostItemIndex={Math.max(0, data.length - 1)}
        className="h-full"
        itemContent={(_, entry) => (
          <div className="mx-auto max-w-3xl px-4 pt-3">
            <NodeTurn
              entry={entry}
              focused={entry.id === focusedNodeId}
              streaming={false}
              streamContent=""
              versionLabel={versionLabelOf(entry)}
              onQuote={quoteSelection}
            />
          </div>
        )}
        components={{
          Footer: () =>
            streamingEntry ? (
              <div className="mx-auto max-w-3xl px-4 pb-4 pt-3">
                <NodeTurn
                  entry={{ ...streamingEntry, assistantContent: '', assistantStatus: 'streaming' }}
                  focused
                  streaming
                  streamContent={streamContent}
                  versionLabel={versionLabelOf(streamingEntry)}
                  onQuote={quoteSelection}
                />
              </div>
            ) : null
        }}
      />
    </div>
  )
}

function Composer() {
  const activeProjectId = useAppStore((state) => selectActiveTabState(state).projectId || null)
  const nodes = useAppStore((state) => selectActiveTabState(state).nodes)
  const activeNodeId = useAppStore((state) => selectActiveTabState(state).activeNodeId)
  const previewNodeId = useAppStore((state) => selectActiveTabState(state).previewNodeId)
  const streaming = useAppStore((state) => selectActiveTabState(state).streaming)
  const busy = useAppStore((state) => state.busy)
  const activeProfile = useAppStore((state) => state.profiles.find((profile) => profile.isActive))
  const pendingQuotes = useAppStore((state) => selectActiveTabState(state).pendingQuotes)
  const removePendingQuote = useAppStore((state) => state.removePendingQuote)
  const sendMessage = useAppStore((state) => state.sendMessage)
  const cancelStream = useAppStore((state) => state.cancelStream)
  const enterFromPreview = useAppStore((state) => state.enterFromPreview)
  const [value, setValue] = useState('')
  const [inputHeight, setInputHeight] = useState(readStoredComposerHeight)
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null)

  const isPreviewOnly = Boolean(previewNodeId && previewNodeId !== activeNodeId)
  const isFirstMessage = nodes.filter((node) => !node.deletedAt).length === 0 && !activeNodeId
  const disabled =
    !activeProjectId || !!streaming || busy || isPreviewOnly || value.trim().length === 0

  const submit = () => {
    if (disabled) return
    const content = value
    setValue('')
    void sendMessage(content)
  }

  const startResize = (event: ReactMouseEvent) => {
    event.preventDefault()
    dragState.current = { startY: event.clientY, startHeight: inputHeight }
    const onMove = (moveEvent: MouseEvent) => {
      const drag = dragState.current
      if (!drag) return
      setInputHeight(clampComposerHeight(drag.startHeight - (moveEvent.clientY - drag.startY)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      dragState.current = null
      setInputHeight((current) => {
        const next = clampComposerHeight(current)
        persistComposerHeight(next)
        return next
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const resetHeight = () => {
    const next = clampComposerHeight(COMPOSER_DEFAULT_HEIGHT)
    setInputHeight(next)
    persistComposerHeight(next)
  }

  return (
    <div className="border-t border-border bg-card-muted/30 px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div
          onMouseDown={startResize}
          onDoubleClick={resetHeight}
          title="拖动调整输入框高度，双击恢复默认"
          className="group/resize -mt-2 mb-1 flex h-3 cursor-row-resize items-center justify-center"
        >
          <div className="h-1 w-12 rounded-full bg-border transition-colors group-hover/resize:bg-accent/70" />
        </div>
        {!activeProfile && (
          <p className="mb-2 text-[11px] text-warning">
            还没有启用模型，请先在「设置 → 模型」（Ctrl+K）里添加并启用一个模型配置。
          </p>
        )}
        {isPreviewOnly && (
          <div className="mb-2 flex items-center gap-2 rounded border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
            <span className="flex-1">预览中：正在查看历史节点，不会从这里发送消息。</span>
            <button
              type="button"
              onClick={() => void enterFromPreview()}
              className="flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-accent-fg hover:bg-accent-hover"
            >
              <ArrowRightToLine className="h-3 w-3" />
              进入并继续
            </button>
          </div>
        )}
        {pendingQuotes.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {pendingQuotes.map((quote, index) => (
              <div
                key={`${quote.quotedNodeId ?? 'quote'}-${index}`}
                className="flex items-start gap-2 rounded border-l-2 border-accent/60 bg-card px-2 py-1"
              >
                <span className="line-clamp-2 flex-1 whitespace-pre-wrap text-[11px] text-fg-muted">
                  {quote.quoteText}
                </span>
                <button
                  type="button"
                  onClick={() => removePendingQuote(index)}
                  className="text-[11px] text-fg-subtle hover:text-danger"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            style={{ height: inputHeight }}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder={
              isFirstMessage
                ? '发送第一条消息，开启主题对话'
                : '继续对话，Ctrl+Enter 发送；选中 AI 回答可引用'
            }
            className="min-h-0 flex-1 resize-none rounded-lg border border-border bg-app px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => void cancelStream()}
              className="rounded-lg bg-danger/80 px-4 py-2 text-sm text-white hover:bg-danger"
            >
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={disabled}
              className="rounded-lg bg-accent px-4 py-2 text-sm text-accent-fg enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function ChatPanel() {
  const activeProjectId = useAppStore((state) => selectActiveTabState(state).projectId || null)
  const projects = useAppStore((state) => state.projects)
  const pathNodes = useAppStore((state) => selectActiveTabState(state).pathNodes)
  const previewNodeId = useAppStore((state) => selectActiveTabState(state).previewNodeId)
  const activeNodeId = useAppStore((state) => selectActiveTabState(state).activeNodeId)
  const enterFromPreview = useAppStore((state) => state.enterFromPreview)
  const saveHistory = useAppStore((state) => state.saveHistory)
  const tabsPosition = useAppStore((state) => state.preferences.ui.tabsPosition)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportNotice, setExportNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!exportNotice) return
    const timer = window.setTimeout(() => setExportNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [exportNotice])

  const project = projects.find((item) => item.id === activeProjectId)
  const focused = pathNodes.find((entry) => entry.id === (previewNodeId ?? activeNodeId))
  const isPreviewOnly = Boolean(previewNodeId && previewNodeId !== activeNodeId)

  const runExport = async (format: HistoryExportFormat) => {
    setExportOpen(false)
    const result = await saveHistory(format)
    if (result && !result.canceled && result.filePath) {
      setExportNotice(`已导出到 ${result.filePath}`)
    }
  }

  const emptyHint = (
    <div className="flex flex-1 items-center justify-center text-sm text-fg-subtle">
      在左侧创建或选择项目，开始你的主题探索。
    </div>
  )

  const conversation = activeProjectId ? (
    <>
      <PathList />
      <Composer />
    </>
  ) : (
    emptyHint
  )

  return (
    <CardShell
      header={
        <>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
            {project?.name ?? '主题对话'}
          </span>
          {focused && (
            <span className="hidden max-w-72 truncate text-[11px] text-fg-muted md:inline">
              第 {pathNodes.length} 轮 ·{' '}
              {focused.title?.trim() || truncate(focused.userContent, 20)}
            </span>
          )}
          {isPreviewOnly && (
            <button
              type="button"
              onClick={() => void enterFromPreview()}
              className="flex items-center gap-1 rounded border border-accent/60 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/10"
            >
              <ArrowRightToLine className="h-3 w-3" />
              进入并继续
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((open) => !open)}
              className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] text-fg-muted hover:bg-card-muted"
            >
              <Download className="h-3 w-3" />
              导出
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-popover py-1 text-xs shadow-xl">
                  <button
                    type="button"
                    disabled={!focused}
                    onClick={() => void runExport('markdown')}
                    className="flex w-full items-center px-3 py-1.5 text-left text-fg-muted hover:bg-card-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    当前路径 → Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => void runExport('json')}
                    className="flex w-full items-center px-3 py-1.5 text-left text-fg-muted hover:bg-card-muted"
                  >
                    整个项目 → JSON
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      }
    >
      {exportNotice && (
        <div className="break-all border-b border-border bg-accent/10 px-4 py-1.5 text-[11px] text-accent">
          {exportNotice}
        </div>
      )}
      {tabsPosition === 'left' ? (
        <div className="flex min-h-0 flex-1">
          <TabBar orientation="left" />
          <div className="flex min-h-0 flex-1 flex-col">{conversation}</div>
        </div>
      ) : (
        <>
          <TabBar orientation="top" />
          {conversation}
        </>
      )}
    </CardShell>
  )
}
