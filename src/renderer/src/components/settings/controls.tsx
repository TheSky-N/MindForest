import { findFontPreset, type FontPreset } from '../../theme/fonts'

export function FontPicker({
  label,
  presets,
  value,
  onChange,
  emptyLabel
}: {
  label: string
  presets: FontPreset[]
  value: string
  onChange: (value: string) => void
  emptyLabel?: string
}) {
  const matched = findFontPreset(presets, value)
  const selected = matched?.id ?? (value ? 'custom' : emptyLabel ? '__empty' : (presets[0]?.id ?? 'custom'))

  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] text-fg-muted">{label}</span>
      <select
        value={selected}
        onChange={(event) => {
          const next = event.target.value
          if (next === 'custom') return
          if (next === '__empty') {
            onChange('')
            return
          }
          const preset = presets.find((item) => item.id === next)
          if (preset) onChange(preset.stack)
        }}
        className="rounded border border-border bg-app px-2 py-1.5 text-xs outline-none focus:border-accent"
      >
        {emptyLabel && <option value="__empty">{emptyLabel}</option>}
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
        <option value="custom">自定义…</option>
      </select>
      {selected === 'custom' && (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="如 'Maple Mono', monospace"
          className="rounded border border-border bg-app px-2 py-1.5 text-xs outline-none focus:border-accent"
        />
      )}
    </label>
  )
}

export function ColorField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex min-w-0 items-center justify-between gap-2 rounded border border-border bg-app px-2 py-1.5 text-[11px] text-fg-muted">
      <span className="truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {value ? (
          <button
            type="button"
            title="恢复为跟随主题"
            onClick={() => onChange('')}
            className="rounded px-1 text-[10px] text-fg-subtle hover:bg-card-muted hover:text-fg"
          >
            跟随主题
          </button>
        ) : (
          <span className="text-[10px] text-fg-subtle">跟随主题</span>
        )}
        <input
          type="color"
          value={value || '#888888'}
          onChange={(event) => onChange(event.target.value)}
          className="h-5 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
        />
      </span>
    </label>
  )
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center justify-between text-[11px] text-fg-muted">
        <span>{label}</span>
        <span className="text-fg-subtle">{format ? format(value) : String(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-[var(--mf-accent)]"
      />
    </label>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <label className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-fg-muted">
      <span className="truncate">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="rounded border border-border bg-app px-2 py-1.5 text-xs outline-none focus:border-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
