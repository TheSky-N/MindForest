import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  REQUIRED_THEME_TOKENS,
  THEMES,
  isColorMode,
  isThemeId,
  normalizePreferences
} from '../../src/renderer/src/theme/palettes'
import { CODE_FONT_PRESETS, UI_FONT_PRESETS } from '../../src/renderer/src/theme/fonts'
import {
  DEFAULT_TREE_APPEARANCE,
  DEFAULT_TREE_EDGE_STYLE,
  DEFAULT_TREE_NODE_FONT,
  DEFAULT_TREE_PALETTES,
  DEFAULT_CHAT_PREFERENCES,
  DEFAULT_UI_PREFERENCES,
  normalizeTaskPreferences
} from '@shared/types'

const themesCss = readFileSync(
  resolve(process.cwd(), 'src/renderer/src/assets/themes.css'),
  'utf8'
)

function extractBlock(themeId: string, mode: string): string {
  const pattern = new RegExp(
    `\\[data-theme='${themeId}'\\]\\[data-mode='${mode}'\\]\\s*\\{([\\s\\S]*?)\\}`,
    'm'
  )
  const match = pattern.exec(themesCss)
  if (!match) throw new Error(`缺少主题块：${themeId}/${mode}`)
  return match[1] ?? ''
}

describe('主题注册表', () => {
  it('六套主题均注册且包含亮暗两套色板', () => {
    expect(THEMES.map((theme) => theme.id)).toEqual([
      'forest',
      'nord',
      'gruvbox',
      'catppuccin',
      'solarized',
      'github'
    ])
    for (const theme of THEMES) {
      expect(theme.darkSwatches).toHaveLength(3)
      expect(theme.lightSwatches).toHaveLength(3)
      expect(theme.shiki.dark.length).toBeGreaterThan(0)
      expect(theme.shiki.light.length).toBeGreaterThan(0)
    }
  })

  it('每个主题块都定义了全部必需 token', () => {
    for (const theme of THEMES) {
      for (const mode of ['dark', 'light'] as const) {
        const block = extractBlock(theme.id, mode)
        for (const token of REQUIRED_THEME_TOKENS) {
          expect(block, `${theme.id}/${mode} 缺少 --mf-${token}`).toContain(`--mf-${token}:`)
        }
      }
    }
  })

  it('偏好值校验与归一化', () => {
    expect(isThemeId('nord')).toBe(true)
    expect(isThemeId('unknown')).toBe(false)
    expect(isColorMode('system')).toBe(true)
    expect(isColorMode('sepia')).toBe(false)

    expect(normalizePreferences(null).themeId).toBe('forest')
    expect(normalizePreferences({ mode: 'light', themeId: 'nord' })).toEqual({
      mode: 'light',
      themeId: 'nord',
      fontUi: '',
      fontCode: '',
      tree: DEFAULT_TREE_APPEARANCE,
      chat: DEFAULT_CHAT_PREFERENCES,
      ui: DEFAULT_UI_PREFERENCES
    })
    expect(normalizePreferences({ mode: 'bad', themeId: 42, fontUi: 7 })).toEqual({
      mode: 'dark',
      themeId: 'forest',
      fontUi: '',
      fontCode: '',
      tree: DEFAULT_TREE_APPEARANCE,
      chat: DEFAULT_CHAT_PREFERENCES,
      ui: DEFAULT_UI_PREFERENCES
    })
    expect(
      normalizePreferences({
        tree: { aspect: '1:1', shape: 'pill', edge: 'step' }
      }).tree
    ).toEqual({
      aspect: '1:1',
      shape: 'pill',
      edge: 'step',
      palettes: DEFAULT_TREE_PALETTES,
      nodeFont: DEFAULT_TREE_NODE_FONT
    })
    expect(
      normalizePreferences({ tree: { aspect: '9:9', shape: 'circle', edge: 'zigzag' } }).tree
    ).toEqual(DEFAULT_TREE_APPEARANCE)
    expect(normalizeTaskPreferences({ summaryProfileId: 'abc' })).toEqual({
      summaryProfileId: 'abc'
    })
    expect(normalizeTaskPreferences({ summaryProfileId: 7 })).toEqual({
      summaryProfileId: ''
    })
  })

  it('树配色与对话偏好归一化（含 v0.2.2 迁移）', () => {
    const normalized = normalizePreferences({
      tree: {
        palettes: {
          forest: {
            other: { background: '#ff0000', border: 'red' },
            main: { border: '#00ff00' },
            edges: {
              main: { color: '#123456', width: 99, dash: 'wavy' },
              normal: { width: 2 }
            }
          }
        }
      },
      chat: { renderUserMarkdown: 'yes', foldLines: 999, viewMode: 'path' }
    })

    expect(normalized.tree.palettes.forest.other.background).toBe('#ff0000')
    expect(normalized.tree.palettes.forest.other.border).toBe('')
    expect(normalized.tree.palettes.forest.main.border).toBe('#00ff00')
    expect(normalized.tree.palettes.forest.edges.main.color).toBe('#123456')
    expect(normalized.tree.palettes.forest.edges.main.width).toBe(8)
    expect(normalized.tree.palettes.forest.edges.main.dash).toBe('solid')
    expect(normalized.tree.palettes.forest.edges.normal.width).toBe(2)
    expect(normalized.tree.palettes.forest.edges.current).toEqual(DEFAULT_TREE_EDGE_STYLE)
    expect(normalized.tree.palettes.nord).toEqual(DEFAULT_TREE_PALETTES.nord)
    expect(normalized.chat.renderUserMarkdown).toBe(true)
    expect(normalized.chat.foldLines).toBe(50)
    expect(normalized.chat.viewMode).toBe('path')

    const migrated = normalizePreferences({
      themeId: 'nord',
      tree: {
        style: {
          child: {
            background: '#ff0000',
            border: '#111111',
            fontFamily: '',
            fontSize: 15,
            fontWeight: 600,
            opacity: 80
          },
          mainNode: { border: '#00ff00' },
          currentNode: { border: '#0000ff' },
          edges: { main: { color: '#123456', width: 4 } }
        }
      }
    })
    expect(migrated.tree.palettes.nord.other.background).toBe('#ff0000')
    expect(migrated.tree.palettes.nord.main.border).toBe('#00ff00')
    expect(migrated.tree.palettes.nord.current.border).toBe('#0000ff')
    expect(migrated.tree.palettes.nord.edges.main.color).toBe('#123456')
    expect(migrated.tree.nodeFont.fontSize).toBe(15)
    expect(migrated.tree.nodeFont.fontWeight).toBe(600)
    expect(migrated.tree.palettes.forest).toEqual(DEFAULT_TREE_PALETTES.forest)

    const uiNormalized = normalizePreferences({
      ui: {
        scale: 500,
        baseFontSize: 1,
        chatFontSize: 30,
        markdownHeadingScale: 0,
        tabsPosition: 'left'
      }
    })
    expect(uiNormalized.ui).toEqual({
      scale: 150,
      baseFontSize: 12,
      chatFontSize: 20,
      markdownHeadingScale: 80,
      tabsPosition: 'left',
      tabsCollapsed: false
    })
    expect(
      normalizePreferences({ ui: { tabsPosition: 'left', tabsCollapsed: true } }).ui
    ).toEqual({ ...DEFAULT_UI_PREFERENCES, tabsPosition: 'left', tabsCollapsed: true })
  })

  it('每套主题的三种节点颜色互不相同', () => {
    const readVar = (block: string, name: string): string => {
      const match = new RegExp(`--mf-${name}:\\s*([^;]+);`).exec(block)
      if (!match) throw new Error(`缺少 --mf-${name}`)
      return match[1]!.trim().toLowerCase()
    }
    for (const theme of THEMES) {
      for (const mode of ['dark', 'light'] as const) {
        const block = extractBlock(theme.id, mode)
        const backgrounds = ['tree-other-bg', 'tree-main-bg', 'tree-current-bg'].map((name) =>
          readVar(block, name)
        )
        const borders = [
          'tree-other-border',
          'tree-main-border',
          'tree-current-border'
        ].map((name) => readVar(block, name))
        expect(new Set(backgrounds).size, `${theme.id}/${mode} 背景色重复`).toBe(3)
        expect(new Set(borders).size, `${theme.id}/${mode} 边框色重复`).toBe(3)
      }
    }
  })

  it('字体预设非空且包含回退', () => {
    expect(UI_FONT_PRESETS.length).toBeGreaterThanOrEqual(4)
    expect(CODE_FONT_PRESETS.length).toBeGreaterThanOrEqual(4)
    expect(UI_FONT_PRESETS[0]?.stack).toContain('sans-serif')
    expect(CODE_FONT_PRESETS[0]?.stack).toContain('monospace')
  })
})
