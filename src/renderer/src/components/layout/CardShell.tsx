import type { ReactNode } from 'react'

export function CardShell({
  header,
  children,
  headerClassName
}: {
  header?: ReactNode
  children: ReactNode
  headerClassName?: string
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {header ? (
        <div
          className={`flex shrink-0 items-center gap-2 border-b border-border bg-card-muted/60 px-3 py-2 ${
            headerClassName ?? ''
          }`}
        >
          {header}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
