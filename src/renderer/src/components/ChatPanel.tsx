import { useEffect, useMemo, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import type { Card, Message, MessageQuote } from '@shared/types'
import { useAppStore } from '../stores/appStore'
import { KindBadge } from './KindBadge'
import { Markdown } from './Markdown'

function CardHeader({ card }: { card: Card }) {
  const renameCard = useAppStore((state) => state.renameCard)
  const deleteCard = useAppStore((state) => state.deleteCard)
  const createChildCard = useAppStore((state) => state.createChildCard)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(card.title)

  useEffect(() => {
    setTitle(card.title)
  }, [card.title])

  const commit = () => {
    setEditing(false)
    const trimmed = title.trim()
    if (trimmed && trimmed !== card.title) void renameCard(card.id, trimmed)
    else setTitle(card.title)
  }

  return (
    <div className="border-b border-slate-800 bg-slate-900/40 px-4 py-2">
      <div className="flex items-center gap-2">
        <KindBadge kind={card.kind} />
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit()
              if (event.key === 'Escape') {
                setEditing(false)
                setTitle(card.title)
              }
            }}
            className="min-w-0 flex-1 rounded border border-emerald-700 bg-slate-950 px-2 py-0.5 text-sm outline-none"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={() => setEditing(true)}
            title="双击重命名"
            className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-200"
          >
            {card.title}
          </button>
        )}
        <button
          type="button"
          onClick={() => void createChildCard(card.id)}
          className="rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-emerald-300"
        >
          ＋子卡片
        </button>
        {card.kind !== 'root' && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`删除卡片「${card.title}」及其全部子卡片？`)) {
                void deleteCard(card.id)
              }
            }}
            className="rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-rose-950 hover:text-rose-300"
          >
            删除卡片
          </button>
        )}
      </div>
      {card.kind === 'branch' && card.inheritedContext && (
        <details className="mt-1 text-[11px] text-slate-500">
          <summary className="cursor-pointer select-none hover:text-slate-400">
            分支卡片：已冻结继承来源对话，点开查看
          </summary>
          <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-slate-950/70 p-2 font-sans text-[11px] text-slate-400">
            {card.inheritedContext}
          </pre>
        </details>
      )}
    </div>
  )
}

interface QuoteSelection {
  messageId: string
  text: string
  x: number
  y: number
}

function MessageRow({ message, quotes }: { message: Message; quotes: MessageQuote[] }) {
  const messages = useAppStore((state) => state.messages)
  const cards = useAppStore((state) => state.cards)
  const streaming = useAppStore((state) => state.streaming)
  const createBranchCard = useAppStore((state) => state.createBranchCard)
  const deleteTurn = useAppStore((state) => state.deleteTurn)
  const regenerate = useAppStore((state) => state.regenerate)
  const setActiveVariant = useAppStore((state) => state.setActiveVariant)
  const editMessage = useAppStore((state) => state.editMessage)
  const addPendingQuote = useAppStore((state) => state.addPendingQuote)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [selection, setSelection] = useState<QuoteSelection | null>(null)

  useEffect(() => {
    setDraft(message.content)
  }, [message.content])

  useEffect(() => {
    if (!selection) return
    const clear = () => setSelection(null)
    window.addEventListener('scroll', clear, true)
    return () => window.removeEventListener('scroll', clear, true)
  }, [selection])

  const isUser = message.role === 'user'
  const turnMessages = messages.filter((item) => item.turnIndex === message.turnIndex)
  const branchPointCard = cards.find(
    (card) =>
      card.branchFromMessageId && turnMessages.some((item) => item.id === card.branchFromMessageId)
  )
  const variants = isUser
    ? []
    : messages.filter(
        (item) => item.role === 'assistant' && item.turnIndex === message.turnIndex
      )
  const variantIndex = variants.findIndex((variant) => variant.id === message.id)
  const busy = streaming !== null

  const handleMouseUp = () => {
    if (isUser || editing) return
    const current = window.getSelection()
    const text = current?.toString().trim() ?? ''
    if (!current || current.isCollapsed || !text) {
      setSelection(null)
      return
    }
    const range = current.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      setSelection(null)
      return
    }
    setSelection({ messageId: message.id, text, x: rect.left + rect.width / 2, y: rect.top })
  }

  const commitEdit = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === message.content) {
      setEditing(false)
      setDraft(message.content)
      return
    }
    const laterTurnCount = new Set(
      messages.filter((item) => item.turnIndex > message.turnIndex).map((item) => item.turnIndex)
    ).size
    const confirmed = window.confirm(
      laterTurnCount > 0
        ? `保存后将删除该轮之后的 ${laterTurnCount} 轮对话（若其中包含分支点会被阻止）。继续？`
        : '保存修改？'
    )
    if (!confirmed) return
    const result = await editMessage(message.id, trimmed)
    setEditing(false)
    if (result?.branchWarning) window.alert(result.branchWarning)
  }

  return (
    <div className={`group flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      {isUser ? (
        <div className="flex w-full flex-col items-end gap-1">
          {quotes.map((quote) => (
            <blockquote
              key={quote.id}
              className="max-w-[85%] rounded border-l-2 border-emerald-600 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-400"
            >
              <span className="line-clamp-4 whitespace-pre-wrap">{quote.quoteText}</span>
            </blockquote>
          ))}
          {editing ? (
            <div className="w-full max-w-[85%]">
              <textarea
                autoFocus
                rows={3}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="w-full resize-none rounded-lg border border-emerald-700 bg-slate-950 px-3 py-2 text-sm outline-none"
              />
              <div className="mt-1 flex justify-end gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setDraft(message.content)
                  }}
                  className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void commitEdit()}
                  className="rounded bg-emerald-700 px-2 py-1 text-white hover:bg-emerald-600"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-emerald-900/60 px-3 py-2 text-sm leading-relaxed text-emerald-50">
              {message.content}
            </div>
          )}
        </div>
      ) : (
        <div
          onMouseUp={handleMouseUp}
          className="w-full rounded-lg bg-slate-800/60 px-4 py-3 text-sm text-slate-200"
        >
          {message.content ? (
            <Markdown content={message.content} />
          ) : (
            <span className="text-xs text-slate-500">（空回复）</span>
          )}
          {message.status === 'error' && message.errorMessage && (
            <p className="mt-2 text-xs text-rose-400">生成失败：{message.errorMessage}</p>
          )}
          {message.status === 'aborted' && (
            <p className="mt-2 text-xs text-amber-500">已停止生成</p>
          )}
        </div>
      )}

      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-600 opacity-0 transition-opacity group-hover:opacity-100">
        <span>第 {message.turnIndex} 轮</span>
        {message.model && <span>{message.model}</span>}
        {!isUser && variants.length > 1 && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              disabled={variantIndex <= 0}
              onClick={() => {
                const target = variants[variantIndex - 1]
                if (target) void setActiveVariant(target.id)
              }}
              className="hover:enabled:text-emerald-300 disabled:opacity-30"
            >
              ‹
            </button>
            <span>
              {variantIndex + 1}/{variants.length}
            </span>
            <button
              type="button"
              disabled={variantIndex < 0 || variantIndex >= variants.length - 1}
              onClick={() => {
                const target = variants[variantIndex + 1]
                if (target) void setActiveVariant(target.id)
              }}
              className="hover:enabled:text-emerald-300 disabled:opacity-30"
            >
              ›
            </button>
          </span>
        )}
        {!isUser && message.isActiveVariant && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void regenerate(message.turnIndex)}
            className="hover:enabled:text-emerald-300 disabled:opacity-30"
          >
            重新生成
          </button>
        )}
        <button
          type="button"
          onClick={() => void createBranchCard(message.id)}
          className="hover:text-amber-300"
        >
          从此处建分支
        </button>
        {isUser && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="hover:text-emerald-300"
          >
            编辑
          </button>
        )}
        {isUser && (
          <button
            type="button"
            disabled={Boolean(branchPointCard)}
            title={
              branchPointCard
                ? `该轮是分支卡片「${branchPointCard.title}」的分支点，受保护不能删除`
                : undefined
            }
            onClick={() => {
              if (window.confirm(`删除第 ${message.turnIndex} 轮对话？`)) {
                void deleteTurn(message.turnIndex)
              }
            }}
            className="hover:enabled:text-rose-400 disabled:cursor-not-allowed disabled:text-slate-700"
          >
            删除本轮
          </button>
        )}
      </div>

      {selection && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            addPendingQuote({ quotedMessageId: selection.messageId, quoteText: selection.text })
            window.getSelection()?.removeAllRanges()
            setSelection(null)
          }}
          style={{ left: selection.x, top: selection.y - 8 }}
          className="fixed z-40 -translate-x-1/2 -translate-y-full rounded-md border border-emerald-700 bg-slate-900 px-2 py-1 text-[11px] text-emerald-300 shadow-lg hover:bg-slate-800"
        >
          引用
        </button>
      )}
    </div>
  )
}

function StreamingBubble({ message }: { message: Message }) {
  const streamContent = useAppStore((state) => state.streamContent)
  return (
    <div className="mx-auto max-w-3xl px-4 pb-4 pt-2">
      <div className="w-full rounded-lg bg-slate-800/60 px-4 py-3 text-sm text-slate-200">
        {streamContent ? (
          <Markdown content={streamContent} streaming />
        ) : (
          <span className="text-xs text-slate-500">正在生成…</span>
        )}
      </div>
      <div className="mt-0.5 text-[10px] text-slate-600">
        第 {message.turnIndex} 轮 · 正在生成
      </div>
    </div>
  )
}

function MessageList() {
  const messages = useAppStore((state) => state.messages)
  const streaming = useAppStore((state) => state.streaming)
  const quotesByMessage = useAppStore((state) => state.quotesByMessage)
  const conversationId = useAppStore((state) => state.conversation?.id)

  const visible = useMemo(
    () => messages.filter((message) => message.role === 'user' || message.isActiveVariant),
    [messages]
  )
  const data = useMemo(
    () => visible.filter((message) => message.id !== streaming?.messageId),
    [visible, streaming]
  )
  const streamingMessage = streaming
    ? messages.find((message) => message.id === streaming.messageId)
    : undefined

  if (visible.length === 0 && !streamingMessage) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-slate-600">
        在一个主题卡片里与 AI 对话，遇到想深入的内容就创建子卡片或从消息建分支。
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1">
      <Virtuoso
        key={conversationId ?? 'none'}
        data={data}
        computeItemKey={(_, message) => message.id}
        followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
        initialTopMostItemIndex={Math.max(0, data.length - 1)}
        className="h-full"
        itemContent={(_, message) => (
          <div className="mx-auto max-w-3xl px-4 pt-2">
            <MessageRow message={message} quotes={quotesByMessage[message.id] ?? []} />
          </div>
        )}
        components={{
          Footer: () =>
            streamingMessage ? <StreamingBubble message={streamingMessage} /> : null
        }}
      />
    </div>
  )
}

function Composer() {
  const conversation = useAppStore((state) => state.conversation)
  const busy = useAppStore((state) => state.busy)
  const streaming = useAppStore((state) => state.streaming)
  const activeProfile = useAppStore((state) => state.profiles.find((profile) => profile.isActive))
  const pendingQuotes = useAppStore((state) => state.pendingQuotes)
  const removePendingQuote = useAppStore((state) => state.removePendingQuote)
  const sendMessage = useAppStore((state) => state.sendMessage)
  const cancelStream = useAppStore((state) => state.cancelStream)
  const [value, setValue] = useState('')
  const disabled = !conversation || !!streaming || busy || value.trim().length === 0

  const submit = () => {
    if (disabled) return
    const content = value
    setValue('')
    void sendMessage(content)
  }

  return (
    <div className="border-t border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {!activeProfile && (
          <p className="mb-2 text-[11px] text-amber-400">
            还没有启用模型，请先在顶部「模型设置」里添加并启用一个模型配置。
          </p>
        )}
        {pendingQuotes.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {pendingQuotes.map((quote, index) => (
              <div
                key={`${quote.quotedMessageId ?? 'quote'}-${index}`}
                className="flex items-start gap-2 rounded border-l-2 border-emerald-600 bg-slate-900/70 px-2 py-1"
              >
                <span className="line-clamp-2 flex-1 whitespace-pre-wrap text-[11px] text-slate-400">
                  {quote.quoteText}
                </span>
                <button
                  type="button"
                  onClick={() => removePendingQuote(index)}
                  className="text-[11px] text-slate-500 hover:text-rose-300"
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
            placeholder="输入内容，Ctrl+Enter 发送；选中 AI 回答可引用"
            className="min-h-0 flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => void cancelStream()}
              className="rounded-lg bg-rose-800 px-4 py-2 text-sm text-white hover:bg-rose-700"
            >
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={disabled}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white enabled:hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
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
  const card = useAppStore((state) => state.cards.find((item) => item.id === state.activeCardId) ?? null)

  if (!card) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-slate-600">
        选择左侧的卡片，开始与 AI 一起探索
      </main>
    )
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <CardHeader card={card} />
      <MessageList />
      <Composer />
    </main>
  )
}
