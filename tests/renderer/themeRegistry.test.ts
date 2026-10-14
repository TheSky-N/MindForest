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
import { DEFAULT_TREE_APPEARANCE, DEFAULT_TREE_EDGE_STYLE, DEFAULT_TREE_STYLE, DEFAULT_CHAT_PREFERENCES, normalizeTaskPreferences } from '@shared/types'

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
      chat: DEFAULT_CHAT_PREFERENCES
    })
    expect(normalizePreferences({ mode: 'bad', themeId: 42, fontUi: 7 })).toEqual({
      mode: 'dark',
      themeId: 'forest',
      fontUi: '',
      fontCode: '',
      tree: DEFAULT_TREE_APPEARANCE,
      chat: DEFAULT_CHAT_PREFERENCES
    })
    expect(
      normalizePreferences({
        tree: { aspect: '1:1', shape: 'pill', edge: 'step' }
      }).tree
    ).toEqual({ aspect: '1:1', shape: 'pill', edge: 'step', style: DEFAULT_TREE_STYLE })
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

  it('树样式与对话偏好归一化', () => {
    const normalized = normalizePreferences({
      tree: {
        style: {
          root: {
            background: '#ff0000',
            border: 'red',
            fontSize: 99,
            fontWeight: 550,
            opacity: 5
          },
          mainNode: { border: '#00ff00' },
          edges: {
            main: { color: '#123456', width: 99, dash: 'wavy' },
            normal: { width: 2 }
          }
        }
      },
      chat: { renderUserMarkdown: 'yes', foldLines: 999, viewMode: 'path' }
    })

    expect(normalized.tree.style.root.background).toBe('#ff0000')
    expect(normalized.tree.style.root.border).toBe('')
    expect(normalized.tree.style.root.fontSize).toBe(24)
    expect(normalized.tree.style.root.fontWeight).toBe(0)
    expect(normalized.tree.style.root.opacity).toBe(20)
    expect(normalized.tree.style.mainNode.border).toBe('#00ff00')
    expect(normalized.tree.style.edges.main.color).toBe('#123456')
    expect(normalized.tree.style.edges.main.width).toBe(8)
    expect(normalized.tree.style.edges.main.dash).toBe('solid')
    expect(normalized.tree.style.edges.normal.width).toBe(2)
    expect(normalized.tree.style.edges.current).toEqual(DEFAULT_TREE_EDGE_STYLE)
    expect(normalized.chat.renderUserMarkdown).toBe(true)
    expect(normalized.chat.foldLines).toBe(50)
    expect(normalized.chat.viewMode).toBe('path')
  })

  it('字体预设非空且包含回退', () => {
    expect(UI_FONT_PRESETS.length).toBeGreaterThanOrEqual(4)
    expect(CODE_FONT_PRESETS.length).toBeGreaterThanOrEqual(4)
    expect(UI_FONT_PRESETS[0]?.stack).toContain('sans-serif')
    expect(CODE_FONT_PRESETS[0]?.stack).toContain('monospace')
  })
})
