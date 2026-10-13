import type { CardKind } from '@shared/types'

const styles: Record<CardKind, string> = {
  root: 'bg-emerald-900/70 text-emerald-300',
  child: 'bg-sky-900/70 text-sky-300',
  branch: 'bg-amber-900/70 text-amber-300'
}

const labels: Record<CardKind, string> = {
  root: '中心',
  child: '子',
  branch: '分支'
}

export function KindBadge({ kind }: { kind: CardKind }) {
  return (
    <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] leading-none ${styles[kind]}`}>
      {labels[kind]}
    </span>
  )
}
