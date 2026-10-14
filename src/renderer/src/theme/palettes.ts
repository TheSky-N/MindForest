import type {
  AppPreferences,
  ChatPreferences,
  ColorMode,
  ThemeId,
  TreeAspectId,
  TreeEdgeDash,
  TreeEdgeId,
  TreeEdgeStyle,
  TreeNodeStyle,
  TreeShapeId,
  TreeStylePreferences
} from '@shared/types'
import {
  DEFAULT_CHAT_PREFERENCES,
  DEFAULT_PREFERENCES,
  DEFAULT_TREE_APPEARANCE,
  DEFAULT_TREE_EDGE_STYLE,
  DEFAULT_TREE_NODE_STYLE
} from '@shared/types'

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

export const TREE_ASPECTS: TreeAspectId[] = ['4:1', '3:1', '2:1', '1:1']
export const TREE_SHAPES: TreeShapeId[] = ['rounded', 'pill', 'square']
export const TREE_EDGES: TreeEdgeId[] = ['bezier', 'smoothstep', 'straight', 'step']

export function isTreeAspect(value: unknown): value is TreeAspectId {
  return typeof value === 'string' && (TREE_ASPECTS as string[]).includes(value)
}

export function isTreeShape(value: unknown): value is TreeShapeId {
  return typeof value === 'string' && (TREE_SHAPES as string[]).includes(value)
}

export function isTreeEdge(value: unknown): value is TreeEdgeId {
  return typeof value === 'string' && (TREE_EDGES as string[]).includes(value)
}

const FONT_WEIGHTS = [400, 500, 600, 700]
const EDGE_DASHES: TreeEdgeDash[] = ['solid', 'dashed', 'dotted']

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function normalizeColor(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return /^#[0-9a-fA-F]{3,8}$/.test(trimmed) ? trimmed : ''
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.round(value), min), max)
}

function normalizeNodeStyle(value: unknown): TreeNodeStyle {
  const record = asRecord(value)
  return {
    background: normalizeColor(record.background),
    border: normalizeColor(record.border),
    text: normalizeColor(record.text),
    fontFamily: typeof record.fontFamily === 'string' ? record.fontFamily : '',
    fontSize: record.fontSize === 0 ? 0 : clampNumber(record.fontSize, 9, 24, 0),
    fontWeight: FONT_WEIGHTS.includes(record.fontWeight as number)
      ? (record.fontWeight as number)
      : 0,
    opacity: clampNumber(record.opacity, 20, 100, DEFAULT_TREE_NODE_STYLE.opacity)
  }
}

function normalizeEdgeStyle(value: unknown): TreeEdgeStyle {
  const record = asRecord(value)
  return {
    color: normalizeColor(record.color),
    width: record.width === 0 ? 0 : clampNumber(record.width, 1, 8, 0),
    dash: EDGE_DASHES.includes(record.dash as TreeEdgeDash)
      ? (record.dash as TreeEdgeDash)
      : DEFAULT_TREE_EDGE_STYLE.dash
  }
}

export function normalizeTreeStyle(value: unknown): TreeStylePreferences {
  const record = asRecord(value)
  const edges = asRecord(record.edges)
  const mainNode = asRecord(record.mainNode)
  const currentNode = asRecord(record.currentNode)
  return {
    root: normalizeNodeStyle(record.root),
    child: normalizeNodeStyle(record.child),
    cluster: normalizeNodeStyle(record.cluster),
    mainNode: { border: normalizeColor(mainNode.border) },
    currentNode: { border: normalizeColor(currentNode.border) },
    edges: {
      normal: normalizeEdgeStyle(edges.normal),
      main: normalizeEdgeStyle(edges.main),
      current: normalizeEdgeStyle(edges.current)
    }
  }
}

export function normalizeChatPreferences(value: unknown): ChatPreferences {
  const record = asRecord(value)
  return {
    renderUserMarkdown:
      typeof record.renderUserMarkdown === 'boolean'
        ? record.renderUserMarkdown
        : DEFAULT_CHAT_PREFERENCES.renderUserMarkdown,
    renderAssistantMarkdown:
      typeof record.renderAssistantMarkdown === 'boolean'
        ? record.renderAssistantMarkdown
        : DEFAULT_CHAT_PREFERENCES.renderAssistantMarkdown,
    foldLines: clampNumber(record.foldLines, 3, 50, DEFAULT_CHAT_PREFERENCES.foldLines),
    viewMode: record.viewMode === 'path' ? 'path' : DEFAULT_CHAT_PREFERENCES.viewMode
  }
}

export function normalizePreferences(value: unknown): AppPreferences {
  if (typeof value !== 'object' || value === null) {
    return {
      ...DEFAULT_PREFERENCES,
      tree: { ...DEFAULT_TREE_APPEARANCE, style: normalizeTreeStyle(undefined) },
      chat: { ...DEFAULT_CHAT_PREFERENCES }
    }
  }
  const record = value as Record<string, unknown>
  const treeRecord =
    typeof record.tree === 'object' && record.tree !== null
      ? (record.tree as Record<string, unknown>)
      : {}
  return {
    mode: isColorMode(record.mode) ? record.mode : DEFAULT_PREFERENCES.mode,
    themeId: isThemeId(record.themeId) ? record.themeId : DEFAULT_PREFERENCES.themeId,
    fontUi: typeof record.fontUi === 'string' ? record.fontUi : '',
    fontCode: typeof record.fontCode === 'string' ? record.fontCode : '',
    tree: {
      aspect: isTreeAspect(treeRecord.aspect)
        ? treeRecord.aspect
        : DEFAULT_TREE_APPEARANCE.aspect,
      shape: isTreeShape(treeRecord.shape) ? treeRecord.shape : DEFAULT_TREE_APPEARANCE.shape,
      edge: isTreeEdge(treeRecord.edge) ? treeRecord.edge : DEFAULT_TREE_APPEARANCE.edge,
      style: normalizeTreeStyle(treeRecord.style)
    },
    chat: normalizeChatPreferences(record.chat)
  }
}
