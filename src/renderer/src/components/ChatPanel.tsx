import { useEffect, useMemo, useState } from 'react'
import { ArrowRightToLine, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'
import type { NodePathEntry } from '@shared/types'
import { useAppStore } from '../stores/appStore'
import { Markdown } from './Markdown'
import { CardShell } from './layout/CardShell'

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
  const groupCount = useAppStore(
    (state) =>
      entry.turnGroupId
        ? state.nodes.filter((node) => node.turnGroupId === entry.turnGroupId && !node.deletedAt)
            .length
        : 1
  )
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.userContent)
  const [syncGroup, setSyncGroup] = useState(false)
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null)
  const busy = useAppStore((state) => state.streaming !== null)

  useEffect(() => {
    setDraft(entry.userContent)
  }, [entry.userContent])

  useEffect(() => {
    if (!selection) return
    const clear = () => setSelection(null)
    window.addEventListener('scroll', clear, true)
    return () => window.removeEventListener('scroll', clear, true)
  }, [selection])

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
    if (!trimmed || trimmed === entry.userContent) {
      setEditing(false)
      setDraft(entry.userContent)
      return
    }
    const confirmed = window.confirm(
      '保存后将删除该节点的全部子节点（可在回收站恢复）。继续？'
    )
    if (!confirmed) return
    await editNode(entry.id, trimmed, syncGroup)
    setEditing(false)
  }

  const assistantContent = streaming ? streamContent : entry.assistantContent

  return (
    <div className="group flex flex-col">
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
            className="w-full resize-none rounded-lg border border-accent bg-app px-3 py-2 text-sm outline-none"
          />
          {groupCount > 1 && (
            <label className="mt-1 flex items-center gap-2 text-[11px] text-fg-muted">
              <input
                type="checkbox"
                checked={syncGroup}
                onChange={(event) => setSyncGroup(event.target.checked)}
              />
              同步更新同组的其他回答版本
            </label>
          )}
          <div className="mt-1 flex justify-end gap-2 text-[11px]">
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
              onClick={() => void commitEdit()}
              className="rounded bg-accent px-2 py-1 text-accent-fg hover:bg-accent-hover"
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-bubble-user px-3 py-2 text-sm leading-relaxed text-bubble-user-fg">
          {entry.userContent}
        </div>
      )}

      <div
        onMouseUp={handleMouseUp}
        className="mt-1 w-full rounded-lg border border-border/60 bg-bubble-ai px-4 py-3 text-sm text-fg"
      >
        {assistantContent ? (
          <Markdown content={assistantContent} streaming={streaming} />
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
      </div>

      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100">
        <span>{truncate(entry.userContent, 12)}</span>
        {versionLabel && (
          <span className="rounded bg-card-muted px-1 text-fg-muted">{versionLabel}</span>
        )}
        {entry.model && <span>{entry.model}</span>}
        {focused && (
          <>
            {!streaming && (
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
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-0.5 hover:text-accent"
            >
              <Pencil className="h-3 w-3" />
              编辑
            </button>
            {entry.parentId && (
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
          </>
        )}
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
  const pathNodes = useAppStore((state) => state.pathNodes)
  const previewNodeId = useAppStore((state) => state.previewNodeId)
  const activeNodeId = useAppStore((state) => state.activeNodeId)
  const streaming = useAppStore((state) => state.streaming)
  const streamContent = useAppStore((state) => state.streamContent)
  const allNodes = useAppStore((state) => state.nodes)
  const addPendingQuote = useAppStore((state) => state.addPendingQuote)

  const focusedNodeId = previewNodeId ?? activeNodeId

  const data = useMemo(
    () => pathNodes.filter((entry) => entry.id !== streaming?.nodeId),
    [pathNodes, streaming]
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

  if (pathNodes.length === 0 && !streamingEntry) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-fg-subtle">
        单击树上的节点可以预览整条对话路径，双击进入并从那里继续。
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
              onQuote={(selection) =>
                addPendingQuote({ quotedNodeId: selection.nodeId, quoteText: selection.text })
              }
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
                  onQuote={(selection) =>
                    addPendingQuote({
                      quotedNodeId: selection.nodeId,
                      quoteText: selection.text
                    })
                  }
                />
              </div>
            ) : null
        }}
      />
    </div>
  )
}

function Composer() {
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const nodes = useAppStore((state) => state.nodes)
  const activeNodeId = useAppStore((state) => state.activeNodeId)
  const previewNodeId = useAppStore((state) => state.previewNodeId)
  const streaming = useAppStore((state) => state.streaming)
  const busy = useAppStore((state) => state.busy)
  const activeProfile = useAppStore((state) => state.profiles.find((profile) => profile.isActive))
  const pendingQuotes = useAppStore((state) => state.pendingQuotes)
  const removePendingQuote = useAppStore((state) => state.removePendingQuote)
  const sendMessage = useAppStore((state) => state.sendMessage)
  const cancelStream = useAppStore((state) => state.cancelStream)
  const enterFromPreview = useAppStore((state) => state.enterFromPreview)
  const [value, setValue] = useState('')

  const isPreviewOnly = Boolean(previewNodeId && previewNodeId !== activeNodeId)
  const isFirstMessage = nodes.length === 0 && !activeNodeId
  const disabled =
    !activeProjectId || !!streaming || busy || isPreviewOnly || value.trim().length === 0

  const submit = () => {
    if (disabled) return
    const content = value
    setValue('')
    void sendMessage(content)
  }

  return (
    <div className="border-t border-border bg-card-muted/30 px-4 py-3">
      <div className="mx-auto max-w-3xl">
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
            rows={2}
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
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const projects = useAppStore((state) => state.projects)
  const pathNodes = useAppStore((state) => state.pathNodes)
  const previewNodeId = useAppStore((state) => state.previewNodeId)
  const activeNodeId = useAppStore((state) => state.activeNodeId)
  const enterFromPreview = useAppStore((state) => state.enterFromPreview)

  const project = projects.find((item) => item.id === activeProjectId)
  const focused = pathNodes.find((entry) => entry.id === (previewNodeId ?? activeNodeId))
  const isPreviewOnly = Boolean(previewNodeId && previewNodeId !== activeNodeId)

  if (!activeProjectId) {
    return (
      <CardShell>
        <div className="flex flex-1 items-center justify-center text-sm text-fg-subtle">
          在左侧创建或选择项目，开始你的主题探索。
        </div>
      </CardShell>
    )
  }

  return (
    <CardShell
      header={
        <>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
            {project?.name ?? '主题对话'}
          </span>
          {focused && (
            <span className="hidden max-w-72 truncate text-[11px] text-fg-muted md:inline">
              第 {pathNodes.length} 轮 · {truncate(focused.userContent, 20)}
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
        </>
      }
    >
      <PathList />
      <Composer />
    </CardShell>
  )
}
