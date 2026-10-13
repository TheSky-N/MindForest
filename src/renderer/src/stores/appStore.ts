import { create } from 'zustand'
import type {
  AppInfo,
  AppPreferences,
  ChatDeltaEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  ClusterWithMembers,
  LlmProfile,
  LlmProfileInput,
  LlmProfileTestResult,
  MigrationReport,
  NodeMeta,
  NodePathEntry,
  Project,
  QuoteInput,
  TaskPreferences,
  TurnNode
} from '@shared/types'
import {
  DEFAULT_PREFERENCES,
  DEFAULT_TASK_PREFERENCES,
  normalizeTaskPreferences
} from '@shared/types'
import { normalizePreferences } from '../theme/palettes'

export const PREFERENCES_KEY = 'preferences.appearance'
export const TASK_PREFERENCES_KEY = 'preferences.tasks'
export const LAYOUT_STORAGE_KEY = 'mindforest.layout.v1'

interface AppState {
  initialized: boolean
  info: AppInfo | null
  migrationReport: MigrationReport | null
  projects: Project[]
  activeProjectId: string | null
  nodes: NodeMeta[]
  clusters: ClusterWithMembers[]
  membership: Record<string, string>
  activeNodeId: string | null
  previewNodeId: string | null
  pathNodes: NodePathEntry[]
  selectedNodeIds: string[]
  pendingQuotes: QuoteInput[]
  profiles: LlmProfile[]
  taskPreferences: TaskPreferences
  streaming: { requestId: string; nodeId: string } | null
  streamContent: string
  clusterSummarizing: string[]
  notice: string | null
  preferences: AppPreferences
  systemDark: boolean
  panelsCollapsed: { sidebar: boolean; tree: boolean }
  layoutVersion: number
  error: string | null
  busy: boolean

  initialize: () => Promise<void>
  createProject: (name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  selectProject: (id: string) => Promise<void>
  reloadTree: () => Promise<void>
  openNode: (nodeId: string, mode: 'preview' | 'enter') => Promise<void>
  enterFromPreview: () => Promise<void>
  closeNode: () => void
  sendMessage: (content: string) => Promise<void>
  regenerate: (nodeId: string) => Promise<void>
  cancelStream: () => Promise<void>
  applyDelta: (event: ChatDeltaEvent) => void
  applyChatResult: (event: ChatDoneEvent | ChatErrorEvent) => void
  editNode: (nodeId: string, content: string, syncGroup?: boolean) => Promise<void>
  deleteNode: (nodeId: string) => Promise<void>
  restoreNode: (nodeId: string) => Promise<void>
  purgeNode: (nodeId: string) => Promise<void>
  setMainBranch: (nodeId: string) => Promise<void>
  setArchived: (nodeId: string, archived: boolean) => Promise<void>
  setCollapsed: (nodeId: string, collapsed: boolean) => Promise<void>
  setSelection: (ids: string[]) => void
  toggleNodeSelection: (nodeId: string) => void
  clearSelection: () => void
  createClusterFromSelection: () => Promise<void>
  renameCluster: (id: string, title: string) => Promise<void>
  summarizeCluster: (id: string) => Promise<void>
  setClusterCollapsed: (id: string, collapsed: boolean) => Promise<void>
  deleteCluster: (id: string) => Promise<void>
  applyClusterUpdated: (cluster: ClusterWithMembers) => void
  addPendingQuote: (quote: QuoteInput) => void
  removePendingQuote: (index: number) => void
  clearNotice: () => void
  loadProfiles: () => Promise<void>
  createProfile: (input: LlmProfileInput) => Promise<LlmProfile | null>
  updateProfile: (id: string, patch: Partial<LlmProfileInput>) => Promise<LlmProfile | null>
  removeProfile: (id: string) => Promise<void>
  setActiveProfile: (id: string) => Promise<void>
  testProfile: (id: string) => Promise<LlmProfileTestResult>
  setPreferences: (patch: Partial<AppPreferences>) => Promise<void>
  setTaskPreferences: (patch: Partial<TaskPreferences>) => Promise<void>
  togglePanel: (panel: 'sidebar' | 'tree') => void
  setPanelCollapsed: (panel: 'sidebar' | 'tree', collapsed: boolean) => void
  resetLayout: () => void
  clearError: () => void
}

let streamBuffer = ''
let flushHandle: number | null = null

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  }
  return String(error)
}

function buildMembership(clusters: ClusterWithMembers[]): Record<string, string> {
  const membership: Record<string, string> = {}
  for (const cluster of clusters) {
    for (const nodeId of cluster.nodeIds) membership[nodeId] = cluster.id
  }
  return membership
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  info: null,
  migrationReport: null,
  projects: [],
  activeProjectId: null,
  nodes: [],
  clusters: [],
  membership: {},
  activeNodeId: null,
  previewNodeId: null,
  pathNodes: [],
  selectedNodeIds: [],
  pendingQuotes: [],
  profiles: [],
  taskPreferences: DEFAULT_TASK_PREFERENCES,
  streaming: null,
  streamContent: '',
  clusterSummarizing: [],
  notice: null,
  preferences: DEFAULT_PREFERENCES,
  systemDark: true,
  panelsCollapsed: { sidebar: false, tree: false },
  layoutVersion: 0,
  error: null,
  busy: false,

  initialize: async () => {
    set({ busy: true })
    try {
      const [info, projects, profiles, storedPreferences, storedTask, migrationReport] =
        await Promise.all([
          window.mindforest.app.getInfo(),
          window.mindforest.projects.list(),
          window.mindforest.llmProfiles.list(),
          window.mindforest.settings.get({ key: PREFERENCES_KEY }),
          window.mindforest.settings.get({ key: TASK_PREFERENCES_KEY }),
          window.mindforest.app.migrationReport()
        ])
      let preferences = DEFAULT_PREFERENCES
      if (storedPreferences) {
        try {
          preferences = normalizePreferences(JSON.parse(storedPreferences))
        } catch {
          preferences = { ...DEFAULT_PREFERENCES }
        }
      }
      let taskPreferences = DEFAULT_TASK_PREFERENCES
      if (storedTask) {
        try {
          taskPreferences = normalizeTaskPreferences(JSON.parse(storedTask))
        } catch {
          taskPreferences = { ...DEFAULT_TASK_PREFERENCES }
        }
      }
      set({
        info,
        projects,
        profiles,
        preferences,
        taskPreferences,
        migrationReport,
        initialized: true,
        error: null
      })
      if (projects.length > 0) await get().selectProject(projects[0]!.id)
    } catch (error) {
      set({ error: errorMessage(error), initialized: true })
    } finally {
      set({ busy: false })
    }
  },

  createProject: async (name) => {
    try {
      const { project } = await window.mindforest.projects.create({ name })
      set((state) => ({ projects: [project, ...state.projects], error: null }))
      await get().selectProject(project.id)
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  deleteProject: async (id) => {
    try {
      await window.mindforest.projects.delete({ id })
      const projects = await window.mindforest.projects.list()
      set({ projects, error: null })
      if (get().activeProjectId === id) {
        set({
          activeProjectId: null,
          nodes: [],
          clusters: [],
          membership: {},
          activeNodeId: null,
          previewNodeId: null,
          pathNodes: [],
          selectedNodeIds: [],
          pendingQuotes: []
        })
        if (projects.length > 0) await get().selectProject(projects[0]!.id)
      }
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  selectProject: async (id) => {
    try {
      set({
        activeProjectId: id,
        nodes: [],
        clusters: [],
        membership: {},
        activeNodeId: null,
        previewNodeId: null,
        pathNodes: [],
        selectedNodeIds: [],
        pendingQuotes: [],
        error: null
      })
      await get().reloadTree()
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  reloadTree: async () => {
    const projectId = get().activeProjectId
    if (!projectId) return
    const [nodes, clusters] = await Promise.all([
      window.mindforest.tree.listNodes({ projectId }),
      window.mindforest.tree.listClusters({ projectId })
    ])
    set({ nodes, clusters, membership: buildMembership(clusters) })
  },

  openNode: async (nodeId, mode) => {
    try {
      const pathNodes = await window.mindforest.tree.getPath({ nodeId })
      set((state) => ({
        pathNodes,
        previewNodeId: nodeId,
        activeNodeId: mode === 'enter' ? nodeId : state.activeNodeId,
        error: null
      }))
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  enterFromPreview: async () => {
    const preview = get().previewNodeId
    if (!preview) return
    set({ activeNodeId: preview })
  },

  closeNode: () => {
    set({ previewNodeId: null, pathNodes: [] })
  },

  sendMessage: async (content) => {
    const projectId = get().activeProjectId
    if (!projectId || get().streaming) return
    const parentId = get().activeNodeId
    const quotes = get().pendingQuotes
    set({ busy: true })
    try {
      const result = await window.mindforest.chat.send({
        projectId,
        parentId,
        content,
        quotes: quotes.length > 0 ? quotes : undefined
      })
      streamBuffer = ''
      set({
        pendingQuotes: [],
        streaming: { requestId: result.requestId, nodeId: result.node.id },
        streamContent: '',
        activeNodeId: result.node.id,
        previewNodeId: result.node.id,
        error: null
      })
      await get().reloadTree()
      await get().openNode(result.node.id, 'enter')
    } catch (error) {
      set({ error: errorMessage(error) })
    } finally {
      set({ busy: false })
    }
  },

  regenerate: async (nodeId) => {
    if (get().streaming) return
    set({ busy: true })
    try {
      const result = await window.mindforest.chat.regenerate({ nodeId })
      streamBuffer = ''
      set({
        streaming: { requestId: result.requestId, nodeId: result.node.id },
        streamContent: '',
        activeNodeId: result.node.id,
        previewNodeId: result.node.id,
        error: null
      })
      await get().reloadTree()
      await get().openNode(result.node.id, 'enter')
    } catch (error) {
      set({ error: errorMessage(error) })
    } finally {
      set({ busy: false })
    }
  },

  cancelStream: async () => {
    const streaming = get().streaming
    if (!streaming) return
    try {
      await window.mindforest.chat.cancel({ requestId: streaming.requestId })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  applyDelta: (event) => {
    const streaming = get().streaming
    if (!streaming || streaming.requestId !== event.requestId) return
    streamBuffer += event.delta
    if (flushHandle !== null) return
    flushHandle = requestAnimationFrame(() => {
      flushHandle = null
      set({ streamContent: streamBuffer })
    })
  },

  applyChatResult: (event) => {
    streamBuffer = ''
    if (flushHandle !== null) {
      cancelAnimationFrame(flushHandle)
      flushHandle = null
    }
    const streaming = get().streaming
    const wasTracked = streaming !== null && streaming.requestId === event.requestId
    const node = event.node as TurnNode
    set((state) => ({
      pathNodes: state.pathNodes.map((entry) =>
        entry.id === node.id ? { ...entry, ...node } : entry
      ),
      nodes: state.nodes.map((meta) =>
        meta.id === node.id
          ? {
              ...meta,
              assistantStatus: node.assistantStatus,
              assistantError: node.assistantError,
              model: node.model
            }
          : meta
      ),
      streaming: wasTracked ? null : streaming,
      streamContent: '',
      error: node.assistantStatus === 'error' ? (node.assistantError ?? '生成失败') : null
    }))
    if (wasTracked) void get().reloadTree()
  },

  editNode: async (nodeId, content, syncGroup) => {
    try {
      await window.mindforest.tree.editNode({ nodeId, content, syncGroup })
      await get().reloadTree()
      const preview = get().previewNodeId
      if (preview) await get().openNode(preview, 'preview')
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  deleteNode: async (nodeId) => {
    try {
      await window.mindforest.tree.deleteNode({ nodeId })
      const affected = get().pathNodes.some((entry) => entry.id === nodeId)
      if (affected) set({ previewNodeId: null, activeNodeId: null, pathNodes: [] })
      await get().reloadTree()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  restoreNode: async (nodeId) => {
    try {
      await window.mindforest.tree.restoreNode({ nodeId })
      await get().reloadTree()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  purgeNode: async (nodeId) => {
    try {
      await window.mindforest.tree.purgeNode({ nodeId })
      await get().reloadTree()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  setMainBranch: async (nodeId) => {
    try {
      await window.mindforest.tree.setMainBranch({ nodeId })
      await get().reloadTree()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  setArchived: async (nodeId, archived) => {
    try {
      await window.mindforest.tree.setArchived({ nodeId, archived })
      await get().reloadTree()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  setCollapsed: async (nodeId, collapsed) => {
    try {
      await window.mindforest.tree.setCollapsed({ nodeId, collapsed })
      await get().reloadTree()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  setSelection: (ids) => set({ selectedNodeIds: ids }),

  toggleNodeSelection: (nodeId) => {
    set((state) => {
      const selected = state.selectedNodeIds.includes(nodeId)
        ? state.selectedNodeIds.filter((id) => id !== nodeId)
        : [...state.selectedNodeIds, nodeId]
      return { selectedNodeIds: selected }
    })
  },

  clearSelection: () => set({ selectedNodeIds: [] }),

  createClusterFromSelection: async () => {
    const projectId = get().activeProjectId
    const nodeIds = get().selectedNodeIds
    if (!projectId || nodeIds.length === 0) return
    try {
      const { cluster, addedNodeCount } = await window.mindforest.tree.createCluster({
        projectId,
        nodeIds
      })
      set({
        selectedNodeIds: [],
        notice:
          addedNodeCount > 0
            ? `已创建主题「${cluster.title}」，自动包含 ${addedNodeCount} 个中间节点`
            : `已创建主题「${cluster.title}」`,
        error: null
      })
      await get().reloadTree()
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  renameCluster: async (id, title) => {
    try {
      await window.mindforest.tree.renameCluster({ id, title })
      await get().reloadTree()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  summarizeCluster: async (id) => {
    if (get().clusterSummarizing.includes(id)) return
    set((state) => ({ clusterSummarizing: [...state.clusterSummarizing, id] }))
    try {
      await window.mindforest.tree.summarizeCluster({ id })
      await get().reloadTree()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    } finally {
      set((state) => ({
        clusterSummarizing: state.clusterSummarizing.filter((item) => item !== id)
      }))
    }
  },

  setClusterCollapsed: async (id, collapsed) => {
    try {
      await window.mindforest.tree.setClusterCollapsed({ id, collapsed })
      await get().reloadTree()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  deleteCluster: async (id) => {
    try {
      await window.mindforest.tree.deleteCluster({ id })
      await get().reloadTree()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  applyClusterUpdated: (cluster) => {
    set((state) => ({
      clusters: state.clusters.map((item) => (item.id === cluster.id ? cluster : item))
    }))
  },

  addPendingQuote: (quote) => {
    set((state) => {
      if (state.pendingQuotes.length >= 5) return state
      return { pendingQuotes: [...state.pendingQuotes, quote] }
    })
  },

  removePendingQuote: (index) => {
    set((state) => ({ pendingQuotes: state.pendingQuotes.filter((_, i) => i !== index) }))
  },

  clearNotice: () => set({ notice: null }),

  loadProfiles: async () => {
    try {
      const profiles = await window.mindforest.llmProfiles.list()
      set({ profiles })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  createProfile: async (input) => {
    try {
      const created = await window.mindforest.llmProfiles.create(input)
      await get().loadProfiles()
      set({ error: null })
      return created
    } catch (error) {
      set({ error: errorMessage(error) })
      return null
    }
  },

  updateProfile: async (id, patch) => {
    try {
      const updated = await window.mindforest.llmProfiles.update({ id, ...patch })
      await get().loadProfiles()
      set({ error: null })
      return updated
    } catch (error) {
      set({ error: errorMessage(error) })
      return null
    }
  },

  removeProfile: async (id) => {
    try {
      await window.mindforest.llmProfiles.remove({ id })
      await get().loadProfiles()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  setActiveProfile: async (id) => {
    try {
      await window.mindforest.llmProfiles.setActive({ id })
      await get().loadProfiles()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  testProfile: async (id) => {
    try {
      return await window.mindforest.llmProfiles.test({ id })
    } catch (error) {
      return { ok: false, error: errorMessage(error) }
    }
  },

  setPreferences: async (patch) => {
    const preferences = { ...get().preferences, ...patch }
    set({ preferences })
    try {
      await window.mindforest.settings.set({
        key: PREFERENCES_KEY,
        value: JSON.stringify(preferences)
      })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  setTaskPreferences: async (patch) => {
    const taskPreferences = { ...get().taskPreferences, ...patch }
    set({ taskPreferences })
    try {
      await window.mindforest.settings.set({
        key: TASK_PREFERENCES_KEY,
        value: JSON.stringify(taskPreferences)
      })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  togglePanel: (panel) => {
    set((state) => ({
      panelsCollapsed: { ...state.panelsCollapsed, [panel]: !state.panelsCollapsed[panel] }
    }))
  },

  setPanelCollapsed: (panel, collapsed) => {
    if (get().panelsCollapsed[panel] === collapsed) return
    set((state) => ({
      panelsCollapsed: { ...state.panelsCollapsed, [panel]: collapsed }
    }))
  },

  resetLayout: () => {
    try {
      localStorage.removeItem(LAYOUT_STORAGE_KEY)
    } catch {
      void 0
    }
    set((state) => ({
      panelsCollapsed: { sidebar: false, tree: false },
      layoutVersion: state.layoutVersion + 1
    }))
  },

  clearError: () => set({ error: null })
}))

export function useEffectiveMode(): 'light' | 'dark' {
  const mode = useAppStore((state) => state.preferences.mode)
  const systemDark = useAppStore((state) => state.systemDark)
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
}
