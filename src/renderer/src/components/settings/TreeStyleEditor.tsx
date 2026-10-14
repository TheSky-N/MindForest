import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type {
  TreeEdgeDash,
  TreeEdgeStyle,
  TreeNodeFont,
  TreeRoleStyle,
  TreeThemePalette
} from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { THEMES } from '../../theme/palettes'
import { ColorField, FontPicker, RangeField, SelectField } from './controls'
import { UI_FONT_PRESETS } from '../../theme/fonts'

type RoleName = 'other' | 'main' | 'current'
type RoleColorKey = keyof TreeRoleStyle

const ROLES: Array<{ id: RoleName; label: string; description: string }> = [
  { id: 'other', label: '其他节点', description: '不在主分支与当前路径上的节点' },
  { id: 'main', label: '主分支节点', description: '主分支路径上的节点' },
  { id: 'current', label: '当前分支节点', description: '当前预览/进入路径上的节点' }
]

const EDGE_KINDS: Array<{ id: 'normal' | 'main' | 'current'; label: string }> = [
  { id: 'normal', label: '普通连线' },
  { id: 'main', label: '主分支连线' },
  { id: 'current', label: '当前路径连线' }
]

const WEIGHT_OPTIONS = [
  { value: '0', label: '默认' },
  { value: '400', label: '常规' },
  { value: '500', label: '中等' },
  { value: '600', label: '半粗' },
  { value: '700', label: '加粗' }
]

const DASH_OPTIONS: Array<{ value: TreeEdgeDash; label: string }> = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' }
]

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim().toLowerCase()
}

function emptyRoleStyle(): TreeRoleStyle {
  return { background: '', border: '', text: '' }
}

function emptyPalette(): TreeThemePalette {
  return {
    other: emptyRoleStyle(),
    main: emptyRoleStyle(),
    current: emptyRoleStyle(),
    edges: {
      normal: { color: '', width: 0, dash: 'solid' },
      main: { color: '', width: 0, dash: 'solid' },
      current: { color: '', width: 0, dash: 'solid' }
    }
  }
}

export function TreeStyleEditor() {
  const preferences = useAppStore((state) => state.preferences)
  const setPreferences = useAppStore((state) => state.setPreferences)
  const [error, setError] = useState<string | null>(null)
  const themeId = preferences.themeId
  const palette = preferences.tree.palettes[themeId]
  const nodeFont = preferences.tree.nodeFont
  const activeTheme = THEMES.find((theme) => theme.id === themeId)

  const updatePalette = (next: TreeThemePalette) => {
    void setPreferences({
      tree: {
        ...preferences.tree,
        palettes: { ...preferences.tree.palettes, [themeId]: next }
      }
    })
  }

  const updateNodeFont = (patch: Partial<TreeNodeFont>) => {
    void setPreferences({ tree: { ...preferences.tree, nodeFont: { ...nodeFont, ...patch } } })
  }

  const updateRole = (role: RoleName, key: RoleColorKey, value: string) => {
    const next: TreeThemePalette = {
      ...palette,
      [role]: { ...palette[role], [key]: value }
    }
    if (key === 'background' || key === 'border') {
      const cssKey = key === 'background' ? 'bg' : 'border'
      const resolved = ROLES.map((item) => {
        const own = next[item.id][key]
        return own ? own.toLowerCase() : cssVar(`--mf-tree-${item.id}-${cssKey}`)
      })
      if (new Set(resolved).size < 3) {
        setError(
          key === 'background'
            ? '主分支、当前与其他节点的背景色不能相同'
            : '主分支、当前与其他节点的边框色不能相同'
        )
        return
      }
    }
    setError(null)
    updatePalette(next)
  }

  const updateEdge = (kind: 'normal' | 'main' | 'current', patch: Partial<TreeEdgeStyle>) => {
    updatePalette({
      ...palette,
      edges: { ...palette.edges, [kind]: { ...palette.edges[kind], ...patch } }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[10px] leading-relaxed text-fg-subtle">
        每套配色主题（左侧「主题」中选择）各有一套树配色；未自定义的颜色跟随该主题的内置方案。
        正在编辑：{activeTheme?.label ?? themeId}。
      </p>

      {ROLES.map((role) => (
        <div key={role.id} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] text-fg-muted">{role.label}</span>
            <span className="text-[10px] text-fg-subtle">{role.description}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <ColorField
              label="背景色"
              value={palette[role.id].background}
              onChange={(value) => updateRole(role.id, 'background', value)}
            />
            <ColorField
              label="边框色"
              value={palette[role.id].border}
              onChange={(value) => updateRole(role.id, 'border', value)}
            />
            <ColorField
              label="文字色"
              value={palette[role.id].text}
              onChange={(value) => updateRole(role.id, 'text', value)}
            />
          </div>
        </div>
      ))}

      {error && (
        <p className="rounded border border-danger/40 bg-danger/10 px-2 py-1 text-[10px] text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-fg-muted">连线样式</span>
        {EDGE_KINDS.map((kind) => {
          const edge = palette.edges[kind.id]
          return (
            <div key={kind.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <ColorField
                label={kind.label}
                value={edge.color}
                onChange={(color) => updateEdge(kind.id, { color })}
              />
              <RangeField
                label="粗细"
                value={edge.width}
                min={0}
                max={8}
                format={(value) => (value === 0 ? '默认' : `${value}px`)}
                onChange={(width) => updateEdge(kind.id, { width })}
              />
              <SelectField
                label=""
                value={edge.dash}
                options={DASH_OPTIONS}
                onChange={(dash) => updateEdge(kind.id, { dash })}
              />
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-fg-muted">节点字体（全部节点）</span>
        <div className="grid grid-cols-2 gap-2">
          <FontPicker
            label="字体"
            presets={UI_FONT_PRESETS}
            value={nodeFont.fontFamily}
            emptyLabel="跟随界面字体"
            onChange={(fontFamily) => updateNodeFont({ fontFamily })}
          />
          <div className="flex items-end">
            <SelectField
              label="字重"
              value={String(nodeFont.fontWeight)}
              options={WEIGHT_OPTIONS}
              onChange={(value) => updateNodeFont({ fontWeight: Number(value) })}
            />
          </div>
          <RangeField
            label="字号"
            value={nodeFont.fontSize}
            min={0}
            max={24}
            format={(value) => (value === 0 ? '默认 (12)' : `${value}px`)}
            onChange={(fontSize) => updateNodeFont({ fontSize })}
          />
          <RangeField
            label="节点透明度"
            value={nodeFont.opacity}
            min={20}
            max={100}
            format={(value) => `${value}%`}
            onChange={(opacity) => updateNodeFont({ opacity })}
          />
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => {
            setError(null)
            updatePalette(emptyPalette())
          }}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted hover:bg-card-muted"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重置当前主题树配色
        </button>
      </div>
    </div>
  )
}
