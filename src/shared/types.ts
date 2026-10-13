export type CardKind = 'root' | 'child' | 'branch'
export type MessageRole = 'user' | 'assistant'
export type MessageStatus = 'streaming' | 'complete' | 'aborted' | 'error'

export interface Project {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface Card {
  id: string
  projectId: string
  parentCardId: string | null
  kind: CardKind
  branchFromMessageId: string | null
  inheritedContext: string | null
  title: string
  titleGenerated: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface Conversation {
  id: string
  cardId: string
  title: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Message {
  id: string
  conversationId: string
  turnIndex: number
  role: MessageRole
  content: string
  status: MessageStatus
  model: string | null
  errorMessage: string | null
  isActiveVariant: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CardSummary {
  cardId: string
  summarizedMessageCount: number
  summarizedTokenCount: number
  summary: string
  updatedAt: Date
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

export interface AppInfo {
  version: string
  platform: string
  dbPath: string
  secureStorageAvailable: boolean
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

export interface ChatDeltaEvent {
  requestId: string
  messageId: string
  delta: string
}

export interface ChatDoneEvent {
  requestId: string
  message: Message
}

export interface ChatErrorEvent {
  requestId: string
  message: Message
}

export interface ChatSendResult {
  requestId: string
  userMessage: Message
  assistantMessage: Message
}

export interface MessageQuote {
  id: string
  messageId: string
  quotedMessageId: string | null
  quoteText: string
  createdAt: Date
  updatedAt: Date
}

export interface QuoteInput {
  quotedMessageId: string | null
  quoteText: string
}

export interface EditMessageResult {
  message: Message
  branchWarning: string | null
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
