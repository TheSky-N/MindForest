import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { ColorMode } from '@shared/types'
import { useAppStore, useEffectiveMode } from '../../stores/appStore'
import { THEMES } from '../../theme/palettes'
import { CODE_FONT_PRESETS, UI_FONT_PRESETS, findFontPreset, type FontPreset } from '../../theme/fonts'

const MODES: Array<{ id: ColorMode; label: string }> = [
  { id: 'light', label: '亮色' },
  { id: 'dark', label: '暗色' },
  { id: 'system', label: '跟随系统' }
]

function FontPicker({
  label,
  presets,
  value,
  onChange
}: {
  label: string
  presets: FontPreset[]
  value: string
  onChange: (value: string) => void
}) {
  const matched = findFontPreset(presets, value)
  const selected = matched?.id ?? (value ? 'custom' : (presets[0]?.id ?? 'custom'))

  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] text-fg-muted">{label}</span>
      <select
        value={selected}
        onChange={(event) => {
          const next = event.target.value
          if (next === 'custom') return
          const preset = presets.find((item) => item.id === next)
          if (preset) onChange(preset.stack)
        }}
        className="rounded border border-border bg-app px-2 py-1.5 text-xs outline-none focus:border-accent"
      >
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

export function AppearanceSection() {
  const preferences = useAppStore((state) => state.preferences)
  const setPreferences = useAppStore((state) => state.setPreferences)
  const resetLayout = useAppStore((state) => state.resetLayout)
  const effectiveMode = useEffectiveMode()
  const [saved, setSaved] = useState(false)

  const pickTheme = (themeId: (typeof THEMES)[number]['id']) => {
    void setPreferences({ themeId })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 text-xs font-medium text-fg">颜色模式</h3>
        <div className="inline-flex rounded-lg border border-border bg-card-muted p-0.5">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => void setPreferences({ mode: mode.id })}
              className={`rounded-md px-3 py-1 text-xs ${
                preferences.mode === mode.id
                  ? 'bg-accent text-accent-fg'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium text-fg">
          主题
          <span className="ml-2 text-[10px] font-normal text-fg-subtle">
            当前预览：{effectiveMode === 'dark' ? '暗色' : '亮色'}
          </span>
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((theme) => {
            const active = preferences.themeId === theme.id
            const swatches = effectiveMode === 'dark' ? theme.darkSwatches : theme.lightSwatches
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => pickTheme(theme.id)}
                className={`flex flex-col gap-2 rounded-lg border p-2.5 text-left ${
                  active
                    ? 'border-accent ring-1 ring-accent'
                    : 'border-border hover:border-border-strong'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {swatches.map((color) => (
                    <span
                      key={color}
                      className="h-4 w-4 rounded-full border border-border"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </span>
                <span className="text-xs text-fg">{theme.label}</span>
                <span className="text-[10px] text-fg-subtle">{theme.description}</span>
              </button>
            )
          })}
        </div>
        {saved && <p className="mt-2 text-[11px] text-accent">主题已应用</p>}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <FontPicker
          label="界面字体"
          presets={UI_FONT_PRESETS}
          value={preferences.fontUi}
          onChange={(fontUi) => void setPreferences({ fontUi })}
        />
        <FontPicker
          label="代码字体"
          presets={CODE_FONT_PRESETS}
          value={preferences.fontCode}
          onChange={(fontCode) => void setPreferences({ fontCode })}
        />
      </section>

      <section>
        <button
          type="button"
          onClick={resetLayout}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted hover:bg-card-muted"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重置面板布局
        </button>
      </section>
    </div>
  )
}
