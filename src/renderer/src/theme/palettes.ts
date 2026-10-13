import type { AppPreferences, ColorMode, ThemeId } from '@shared/types'
import { DEFAULT_PREFERENCES } from '@shared/types'

export interface ThemePalette {
  id: ThemeId
  label: string
  description: string
  darkSwatches: [string, string, string]
  lightSwatches: [string, string, string]
  shiki: { light: string; dark: string }
}

export const REQUIRED_THEME_TOKENS = [
  'app',
  'card',
  'card-muted',
  'popover',
  'border',
  'border-strong',
  'fg',
  'fg-muted',
  'fg-subtle',
  'accent',
  'accent-hover',
  'accent-fg',
  'ring',
  'danger',
  'warning',
  'node-root-bg',
  'node-root-border',
  'node-root-fg',
  'node-child-bg',
  'node-child-border',
  'node-child-fg',
  'node-branch-bg',
  'node-branch-border',
  'node-branch-fg',
  'edge',
  'canvas-dot',
  'selection',
  'bubble-user-bg',
  'bubble-user-fg',
  'bubble-ai-bg'
] as const

export const THEMES: ThemePalette[] = [
  {
    id: 'forest',
    label: '森林 Forest',
    description: '默认主题，自然绿意',
    darkSwatches: ['#0b1220', '#111a2b', '#10b981'],
    lightSwatches: ['#f5f7f4', '#ffffff', '#059669'],
    shiki: { light: 'github-light-default', dark: 'github-dark-default' }
  },
  {
    id: 'nord',
    label: '北境 Nord',
    description: '北欧冷调，柔和克制',
    darkSwatches: ['#242933', '#2e3440', '#88c0d0'],
    lightSwatches: ['#e9edf4', '#ffffff', '#5e81ac'],
    shiki: { light: 'github-light-default', dark: 'nord' }
  },
  {
    id: 'gruvbox',
    label: '复古 Gruvbox',
    description: '暖色怀旧，对比强烈',
    darkSwatches: ['#1d2021', '#282828', '#b8bb26'],
    lightSwatches: ['#f2e8c6', '#fbf1c7', '#79740e'],
    shiki: { light: 'gruvbox-light-medium', dark: 'gruvbox-dark-medium' }
  },
  {
    id: 'catppuccin',
    label: '猫猫 Catppuccin',
    description: '柔和糖果色，护眼',
    darkSwatches: ['#11111b', '#1e1e2e', '#a6e3a1'],
    lightSwatches: ['#e6e9ef', '#ffffff', '#40a02b'],
    shiki: { light: 'catppuccin-latte', dark: 'catppuccin-mocha' }
  },
  {
    id: 'solarized',
    label: '日光 Solarized',
    description: '经典低对比，久看不累',
    darkSwatches: ['#002b36', '#073642', '#2aa198'],
    lightSwatches: ['#f5eeda', '#fdf6e3', '#268bd2'],
    shiki: { light: 'solarized-light', dark: 'solarized-dark' }
  },
  {
    id: 'github',
    label: '简洁 GitHub',
    description: '中性利落，信息密度高',
    darkSwatches: ['#0d1117', '#161b22', '#3fb950'],
    lightSwatches: ['#f6f8fa', '#ffffff', '#1f883d'],
    shiki: { light: 'github-light-default', dark: 'github-dark-default' }
  }
]

export const THEME_IDS = THEMES.map((theme) => theme.id)

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as string[]).includes(value)
}

export function isColorMode(value: unknown): value is ColorMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function normalizePreferences(value: unknown): AppPreferences {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_PREFERENCES }
  const record = value as Record<string, unknown>
  return {
    mode: isColorMode(record.mode) ? record.mode : DEFAULT_PREFERENCES.mode,
    themeId: isThemeId(record.themeId) ? record.themeId : DEFAULT_PREFERENCES.themeId,
    fontUi: typeof record.fontUi === 'string' ? record.fontUi : '',
    fontCode: typeof record.fontCode === 'string' ? record.fontCode : ''
  }
}
