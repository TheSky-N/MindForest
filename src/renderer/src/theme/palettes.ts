import type {
  AppPreferences,
  ChatPreferences,
  ColorMode,
  ThemeId,
  TreeAspectId,
  TreeEdgeDash,
  TreeEdgeId,
  TreeEdgeStyle,
  TreeNodeFont,
  TreeRoleStyle,
  TreeShapeId,
  TreeThemePalette,
  UiPreferences
} from '@shared/types'
import {
  DEFAULT_CHAT_PREFERENCES,
  DEFAULT_PREFERENCES,
  DEFAULT_TREE_APPEARANCE,
  DEFAULT_TREE_EDGE_STYLE,
  DEFAULT_TREE_NODE_FONT,
  DEFAULT_UI_PREFERENCES
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
  'tree-main-bg',
  'tree-main-border',
  'tree-main-fg',
  'tree-other-bg',
  'tree-other-border',
  'tree-other-fg',
  'tree-current-bg',
  'tree-current-border',
  'tree-current-fg',
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

export function normalizeColor(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return /^#[0-9a-fA-F]{3,8}$/.test(trimmed) ? trimmed : ''
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.round(value), min), max)
}

function normalizeRoleStyle(value: unknown): TreeRoleStyle {
  const record = asRecord(value)
  return {
    background: normalizeColor(record.background),
    border: normalizeColor(record.border),
    text: normalizeColor(record.text)
  }
}

function normalizeNodeFont(value: unknown): TreeNodeFont {
  const record = asRecord(value)
  return {
    fontFamily: typeof record.fontFamily === 'string' ? record.fontFamily : '',
    fontSize: record.fontSize === 0 ? 0 : clampNumber(record.fontSize, 9, 24, 0),
    fontWeight: FONT_WEIGHTS.includes(record.fontWeight as number)
      ? (record.fontWeight as number)
      : 0,
    opacity: clampNumber(record.opacity, 20, 100, DEFAULT_TREE_NODE_FONT.opacity)
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

export function normalizeTreePalette(value: unknown): TreeThemePalette {
  const record = asRecord(value)
  const edges = asRecord(record.edges)
  return {
    other: normalizeRoleStyle(record.other),
    main: normalizeRoleStyle(record.main),
    current: normalizeRoleStyle(record.current),
    edges: {
      normal: normalizeEdgeStyle(edges.normal),
      main: normalizeEdgeStyle(edges.main),
      current: normalizeEdgeStyle(edges.current)
    }
  }
}

function defaultTreePalettes(): Record<ThemeId, TreeThemePalette> {
  const result = {} as Record<ThemeId, TreeThemePalette>
  for (const theme of THEME_IDS) result[theme] = normalizeTreePalette(undefined)
  return result
}

interface LegacyTreeMigration {
  palettes: Record<ThemeId, TreeThemePalette>
  nodeFont: TreeNodeFont | null
}

function normalizeTreePalettes(
  value: unknown,
  legacyStyle: unknown,
  activeThemeId: ThemeId
): LegacyTreeMigration {
  const record = asRecord(value)
  const palettes = defaultTreePalettes()
  for (const theme of THEME_IDS) {
    if (record[theme] !== undefined) palettes[theme] = normalizeTreePalette(record[theme])
  }

  const legacy = asRecord(legacyStyle)
  if (Object.keys(legacy).length === 0) return { palettes, nodeFont: null }

  const child = asRecord(legacy.child)
  const mainNode = asRecord(legacy.mainNode)
  const currentNode = asRecord(legacy.currentNode)
  const edges = asRecord(legacy.edges)
  const base = palettes[activeThemeId]
  palettes[activeThemeId] = {
    other: {
      background: normalizeColor(child.background),
      border: normalizeColor(child.border),
      text: normalizeColor(child.text)
    },
    main: { background: '', border: normalizeColor(mainNode.border), text: '' },
    current: { background: '', border: normalizeColor(currentNode.border), text: '' },
    edges: {
      normal: normalizeEdgeStyle(edges.normal ?? base.edges.normal),
      main: normalizeEdgeStyle(edges.main ?? base.edges.main),
      current: normalizeEdgeStyle(edges.current ?? base.edges.current)
    }
  }
  const nodeFont = normalizeNodeFont({
    fontFamily: child.fontFamily,
    fontSize: child.fontSize,
    fontWeight: child.fontWeight,
    opacity: child.opacity
  })
  return { palettes, nodeFont }
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
    viewMode: record.viewMode === 'path' ? 'path' : DEFAULT_CHAT_PREFERENCES.viewMode,
    reasoningDisplay:
      record.reasoningDisplay === 'always' || record.reasoningDisplay === 'hidden'
        ? record.reasoningDisplay
        : DEFAULT_CHAT_PREFERENCES.reasoningDisplay,
    reasoningFoldLines: clampNumber(
      record.reasoningFoldLines,
      3,
      40,
      DEFAULT_CHAT_PREFERENCES.reasoningFoldLines
    )
  }
}

export function normalizeUiPreferences(value: unknown): UiPreferences {
  const record = asRecord(value)
  return {
    scale: clampNumber(record.scale, 75, 150, DEFAULT_UI_PREFERENCES.scale),
    baseFontSize: clampNumber(record.baseFontSize, 12, 20, DEFAULT_UI_PREFERENCES.baseFontSize),
    chatFontSize: clampNumber(record.chatFontSize, 12, 20, DEFAULT_UI_PREFERENCES.chatFontSize),
    markdownHeadingScale: clampNumber(
      record.markdownHeadingScale,
      80,
      140,
      DEFAULT_UI_PREFERENCES.markdownHeadingScale
    ),
    tabsPosition: record.tabsPosition === 'left' ? 'left' : 'top',
    tabsCollapsed:
      typeof record.tabsCollapsed === 'boolean'
        ? record.tabsCollapsed
        : DEFAULT_UI_PREFERENCES.tabsCollapsed
  }
}

export function normalizePreferences(value: unknown): AppPreferences {
  if (typeof value !== 'object' || value === null) {
    return {
      ...DEFAULT_PREFERENCES,
      tree: {
        ...DEFAULT_TREE_APPEARANCE,
        palettes: defaultTreePalettes(),
        nodeFont: { ...DEFAULT_TREE_NODE_FONT }
      },
      chat: { ...DEFAULT_CHAT_PREFERENCES },
      ui: { ...DEFAULT_UI_PREFERENCES }
    }
  }
  const record = value as Record<string, unknown>
  const treeRecord =
    typeof record.tree === 'object' && record.tree !== null
      ? (record.tree as Record<string, unknown>)
      : {}
  const themeId = isThemeId(record.themeId) ? record.themeId : DEFAULT_PREFERENCES.themeId
  const migration = normalizeTreePalettes(treeRecord.palettes, treeRecord.style, themeId)
  const nodeFont =
    treeRecord.nodeFont !== undefined
      ? normalizeNodeFont(treeRecord.nodeFont)
      : (migration.nodeFont ?? { ...DEFAULT_TREE_NODE_FONT })

  return {
    mode: isColorMode(record.mode) ? record.mode : DEFAULT_PREFERENCES.mode,
    themeId,
    fontUi: typeof record.fontUi === 'string' ? record.fontUi : '',
    fontCode: typeof record.fontCode === 'string' ? record.fontCode : '',
    tree: {
      aspect: isTreeAspect(treeRecord.aspect) ? treeRecord.aspect : DEFAULT_TREE_APPEARANCE.aspect,
      shape: isTreeShape(treeRecord.shape) ? treeRecord.shape : DEFAULT_TREE_APPEARANCE.shape,
      edge: isTreeEdge(treeRecord.edge) ? treeRecord.edge : DEFAULT_TREE_APPEARANCE.edge,
      palettes: migration.palettes,
      nodeFont
    },
    chat: normalizeChatPreferences(record.chat),
    ui: normalizeUiPreferences(record.ui)
  }
}
