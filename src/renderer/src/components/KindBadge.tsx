import type { CardKind } from '@shared/types'

const styles: Record<CardKind, string> = {
  root: 'border-node-root-border bg-node-root text-node-root-fg',
  child: 'border-node-child-border bg-node-child text-node-child-fg',
  branch: 'border-node-branch-border bg-node-branch text-node-branch-fg'
}

const labels: Record<CardKind, string> = {
  root: '中心',
  child: '子',
  branch: '分支'
}

export function KindBadge({ kind }: { kind: CardKind }) {
  return (
    <span className={`shrink-0 rounded border px-1 py-0.5 text-[10px] leading-none ${styles[kind]}`}>
      {labels[kind]}
    </span>
  )
}
