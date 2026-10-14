export interface Project {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export type NodeStatus = 'streaming' | 'complete' | 'aborted' | 'error'

export interface TurnNode {
  id: string
  projectId: string
  parentId: string | null
  userContent: string
  assistantContent: string
  assistantStatus: NodeStatus
  assistantError: string | null
  model: string | null
  turnGroupId: string | null
  sortOrder: number
  isMainBranch: boolean
  isArchived: boolean
  isCollapsed: boolean
  answerCollapsed: boolean
  promptTokens: number | null
  completionTokens: number | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface NodeMeta {
  id: string
  projectId: string
  parentId: string | null
  userContent: string
  assistantStatus: NodeStatus
  assistantError: string | null
  model: string | null
  turnGroupId: string | null
  sortOrder: number
  isMainBranch: boolean
  isArchived: boolean
  isCollapsed: boolean
  deletedAt: Date | null
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
}

export type HistoryExportFormat = 'markdown' | 'json'

export interface HistoryExportResult {
  canceled: boolean
  filePath: string | null
}

export interface NodeQuote {
  id: string
  nodeId: string
  quotedNodeId: string | null
  quoteText: string
  createdAt: Date
  updatedAt: Date
}

export interface NodePathEntry extends TurnNode {
  quotes: NodeQuote[]
}

export interface QuoteInput {
  quotedNodeId: string | null
  quoteText: string
}

export interface TopicCluster {
  id: string
  projectId: string
  title: string
  titleGenerated: boolean
  summary: string | null
  color: string | null
  isCollapsed: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ClusterWithMembers extends TopicCluster {
  nodeIds: string[]
}

export interface DeletedNodeInfo {
  node: TurnNode
  descendantCount: number
}

export interface MigrationReport {
  migratedAt: string
  projects: number
  cards: number
  nodes: number
  clusters: number
  backupPath: string | null
}

export interface ChatDeltaEvent {
  requestId: string
  nodeId: string
  delta: string
}

export interface ChatDoneEvent {
  requestId: string
  node: TurnNode
}

export interface ChatErrorEvent {
  requestId: string
  node: TurnNode
}

export interface ChatSendResult {
  requestId: string
  node: TurnNode
}

export interface LlmProfile {
  id: string
  name: string
  baseUrl: string
  model: string
  temperature: number
  hasApiKey: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface LlmProfileInput {
  name: string
  baseUrl: string
  model: string
  temperature?: number
  apiKey?: string
}

export interface LlmProfileTestResult {
  ok: boolean
  reply?: string
  error?: string
}

export interface AppInfo {
  version: string
  platform: string
  dbPath: string
  secureStorageAvailable: boolean
}

export type ColorMode = 'light' | 'dark' | 'system'

export type ThemeId = 'forest' | 'nord' | 'gruvbox' | 'catppuccin' | 'solarized' | 'github'

export type TreeAspectId = '4:1' | '3:1' | '2:1' | '1:1'

export type TreeShapeId = 'rounded' | 'pill' | 'square'

export type TreeEdgeId = 'bezier' | 'smoothstep' | 'straight' | 'step'

export interface TreeAppearancePreferences {
  aspect: TreeAspectId
  shape: TreeShapeId
  edge: TreeEdgeId
}

export interface AppPreferences {
  mode: ColorMode
  themeId: ThemeId
  fontUi: string
  fontCode: string
  tree: TreeAppearancePreferences
}

export interface TaskPreferences {
  summaryProfileId: string
}

export const DEFAULT_TREE_APPEARANCE: TreeAppearancePreferences = {
  aspect: '3:1',
  shape: 'rounded',
  edge: 'bezier'
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  mode: 'dark',
  themeId: 'forest',
  fontUi: '',
  fontCode: '',
  tree: DEFAULT_TREE_APPEARANCE
}

export const DEFAULT_TASK_PREFERENCES: TaskPreferences = {
  summaryProfileId: ''
}

export function normalizeTaskPreferences(value: unknown): TaskPreferences {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_TASK_PREFERENCES }
  const record = value as Record<string, unknown>
  return {
    summaryProfileId: typeof record.summaryProfileId === 'string' ? record.summaryProfileId : ''
  }
}
