import { useEffect, useMemo, type ComponentType } from 'react'
import { GitBranch, Plus, Sparkles, Trash2, Type } from 'lucide-react'
import type { Card } from '@shared/types'

export interface CardContextMenuProps {
  card: Card
  x: number
  y: number
  generating: boolean
  onClose: () => void
  onCreateChild: (card: Card) => void
  onCreateBranch: (card: Card) => void
  onRename: (card: Card) => void
  onGenerateTitle: (card: Card) => void
  onDelete: (card: Card) => void
}

const MENU_WIDTH = 176
const MENU_HEIGHT = 224

function MenuItem({
  icon: Icon,
  label,
  disabled,
  danger,
  onClick
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'text-danger hover:bg-danger/15' : 'text-fg-muted hover:bg-card-muted'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

export function CardContextMenu(props: CardContextMenuProps) {
  const { card, x, y, generating, onClose } = props

  useEffect(() => {
    const close = () => onClose()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const position = useMemo(() => {
    const left = Math.max(4, Math.min(x, window.innerWidth - MENU_WIDTH - 4))
    const top = Math.max(4, Math.min(y, window.innerHeight - MENU_HEIGHT - 4))
    return { left, top }
  }, [x, y])

  return (
    <div
      style={position}
      onMouseDown={(event) => event.stopPropagation()}
      className="fixed z-50 w-44 rounded-lg border border-border bg-popover py-1 shadow-xl"
    >
      <MenuItem
        icon={Plus}
        label="建立子卡片"
        onClick={() => {
          props.onCreateChild(card)
          onClose()
        }}
      />
      <MenuItem
        icon={GitBranch}
        label="建立分支卡片"
        onClick={() => {
          props.onCreateBranch(card)
          onClose()
        }}
      />
      <MenuItem
        icon={Type}
        label="重命名"
        onClick={() => {
          props.onRename(card)
          onClose()
        }}
      />
      <MenuItem
        icon={Sparkles}
        label={generating ? '正在总结主题…' : 'AI 总结主题'}
        disabled={generating}
        onClick={() => {
          props.onGenerateTitle(card)
          onClose()
        }}
      />
      <div className="my-1 border-t border-border" />
      <MenuItem
        icon={Trash2}
        label="删除卡片"
        danger
        disabled={card.kind === 'root'}
        onClick={() => {
          props.onDelete(card)
          onClose()
        }}
      />
    </div>
  )
}
