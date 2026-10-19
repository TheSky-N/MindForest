import type { ChatViewMode, ReasoningDisplay } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { RangeField } from './controls'

function ToggleRow({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-card-muted/40 px-3 py-2">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-fg">{label}</span>
        <span className="text-[10px] leading-relaxed text-fg-subtle">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-border'
        }`}
      >
        <span
          className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </button>
    </label>
  )
}

const VIEW_MODE_OPTIONS: Array<{ value: ChatViewMode; label: string }> = [
  { value: 'single', label: '单轮' },
  { value: 'path', label: '整条路径' }
]

const REASONING_OPTIONS: Array<{ value: ReasoningDisplay; label: string }> = [
  { value: 'always', label: '默认展开' },
  { value: 'collapsed', label: '折叠' },
  { value: 'hidden', label: '隐藏' }
]

export function ChatSection() {
  const preferences = useAppStore((state) => state.preferences)
  const setPreferences = useAppStore((state) => state.setPreferences)
  const chat = preferences.chat

  const updateChat = (patch: Partial<typeof chat>) => {
    void setPreferences({ chat: { ...chat, ...patch } })
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-fg">消息渲染</h3>
        <ToggleRow
          label="以 Markdown 渲染 AI 回答"
          description="关闭后 AI 回答以纯文本显示，不渲染标题、代码块与公式。"
          checked={chat.renderAssistantMarkdown}
          onChange={(renderAssistantMarkdown) => updateChat({ renderAssistantMarkdown })}
        />
        <ToggleRow
          label="以 Markdown 渲染用户消息"
          description="开启后你发送的消息中的 Markdown 语法也会被渲染。"
          checked={chat.renderUserMarkdown}
          onChange={(renderUserMarkdown) => updateChat({ renderUserMarkdown })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-medium text-fg">查看与折叠</h3>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-fg-muted">查看模式</span>
          <div className="flex gap-1">
            {VIEW_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updateChat({ viewMode: option.value })}
                className={`rounded-md border px-2 py-1 text-[11px] ${
                  chat.viewMode === option.value
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border text-fg-muted hover:bg-card-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-fg-subtle">
            单轮：选中节点后只显示该轮对话；整条路径：显示从起点到该节点的完整对话。
          </span>
        </div>
        <RangeField
          label="折叠后显示的行数"
          value={chat.foldLines}
          min={3}
          max={50}
          format={(value) => `${value} 行`}
          onChange={(foldLines) => updateChat({ foldLines })}
        />
        <span className="text-[10px] text-fg-subtle">
          用户消息超过该行数时默认折叠；折叠后的消息（含 AI 回答）统一显示该行数。
        </span>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-medium text-fg">思考过程</h3>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-fg-muted">模型思考内容</span>
          <div className="flex gap-1">
            {REASONING_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updateChat({ reasoningDisplay: option.value })}
                className={`rounded-md border px-2 py-1 text-[11px] ${
                  chat.reasoningDisplay === option.value
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border text-fg-muted hover:bg-card-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-fg-subtle">
            仅对启用「推理」能力的模型生效；思考内容不会加入后续对话上下文。
          </span>
        </div>
        <RangeField
          label="折叠时显示的行数"
          value={chat.reasoningFoldLines}
          min={3}
          max={40}
          format={(value) => `${value} 行`}
          onChange={(reasoningFoldLines) => updateChat({ reasoningFoldLines })}
        />
      </section>
    </div>
  )
}
