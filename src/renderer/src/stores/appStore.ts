import { create } from 'zustand'
import type {
  AppInfo,
  AppPreferences,
  ChatDeltaEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  ClusterWithMembers,
  HistoryExportFormat,
  HistoryExportResult,
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
export const TABS_STORAGE_KEY = 'mindforest.tabs.v1'

export interface TabState {
  id: string
  projectId: string
  activeNodeId: string | null
  previewNodeId: string | null
  pathNodes: NodePathEntry[]
  nodes: NodeMeta[]
  clusters: ClusterWithMembers[]
  membership: Record<string, string>
  selectedNodeIds: string[]
  pendingQuotes: QuoteInput[]
  streaming: { requestId: string; nodeId: string } | null
  streamContent: string
  loaded: boolean
}

export const EMPTY_TAB: TabState = {
  id: '',
  projectId: '',
  activeNodeId: null,
  previewNodeId: null,
  pathNodes: [],
  nodes: [],
  clusters: [],
  membership: {},
  selectedNodeIds: [],
  pendingQuotes: [],
  streaming: null,
  streamContent: '',
  loaded: false
}

interface PersistedTab {
  id: string
  projectId: string
  activeNodeId: string | null
  previewNodeId: string | null
}

interface AppState {
  initialized: boolean
  info: AppInfo | null
  migrationReport: MigrationReport | null
  projects: Project[]
  tabs: TabState[]
  activeTabId: string | null
  profiles: LlmProfile[]
  taskPreferences: TaskPreferences
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
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  openProjectTab: (projectId: string) => Promise<void>
  newTab: () => Promise<void>
  closeTab: (tabId: string) => Promise<void>
  closeOtherTabs: (tabId: string) => Promise<void>
  activateTab: (tabId: string) => Promise<void>
  cycleTab: (direction: 1 | -1) => Promise<void>
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
  renameNode: (nodeId: string, title: string | null) => Promise<void>
  generateNodeTitle: (nodeId: string) => Promise<void>
  deleteNode: (nodeId: string) => Promise<void>
  restoreNode: (nodeId: string) => Promise<void>
  purgeNode: (nodeId: string) => Promise<void>
  setMainBranch: (nodeId: string) => Promise<void>
  setArchived: (nodeId: string, archived: boolean) => Promise<void>
  setCollapsed: (nodeId: string, collapsed: boolean) => Promise<void>
  toggleAnswerCollapsed: (nodeId: string) => Promise<void>
  setUserCollapsed: (nodeId: string, collapsed: boolean) => Promise<void>
  saveHistory: (format: HistoryExportFormat) => Promise<HistoryExportResult | null>
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

function collectSubtreeIds(nodes: NodeMeta[], rootId: string): Set<string> {
  const ids = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id)
        changed = true
      }
    }
  }
  return ids
}

function makeTab(id: string, projectId: string): TabState {
  return { ...EMPTY_TAB, id, projectId }
}

function readStoredTabs(): { tabs: PersistedTab[]; activeTabId: string | null } {
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY)
    if (!raw) return { tabs: [], activeTabId: null }
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return { tabs: [], activeTabId: null }
    const record = parsed as { tabs?: unknown; activeTabId?: unknown }
    const tabs = Array.isArray(record.tabs)
      ? record.tabs
          .filter(
            (tab): tab is PersistedTab =>
              typeof tab === 'object' &&
              tab !== null &&
              typeof (tab as PersistedTab).id === 'string' &&
              typeof (tab as PersistedTab).projectId === 'string'
          )
          .map((tab) => ({
            id: tab.id,
            projectId: tab.projectId,
            activeNodeId: typeof tab.activeNodeId === 'string' ? tab.activeNodeId : null,
            previewNodeId: typeof tab.previewNodeId === 'string' ? tab.previewNodeId : null
          }))
      : []
    const activeTabId = typeof record.activeTabId === 'string' ? record.activeTabId : null
    return { tabs, activeTabId }
  } catch {
    return { tabs: [], activeTabId: null }
  }
}

function newTabId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const useAppStore = create<AppState>((set, get) => {
  const streamBuffers = new Map<string, string>()
  const flushHandles = new Map<string, number>()

  const findTab = (tabId: string | null): TabState | null =>
    tabId ? (get().tabs.find((tab) => tab.id === tabId) ?? null) : null

  const getActiveTab = (): TabState | null => findTab(get().activeTabId)

  const patchTab = (tabId: string, patch: Partial<TabState>): void => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab))
    }))
  }

  const persistTabs = (): void => {
    try {
      const { tabs, activeTabId } = get()
      const payload = {
        tabs: tabs.map((tab) => ({
          id: tab.id,
          projectId: tab.projectId,
          activeNodeId: tab.activeNodeId,
          previewNodeId: tab.previewNodeId
        })),
        activeTabId
      }
      localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      void 0
    }
  }

  const loadTabTree = async (tabId: string): Promise<void> => {
    const tab = findTab(tabId)
    if (!tab) return
    try {
      const [nodes, clusters] = await Promise.all([
        window.mindforest.tree.listNodes({ projectId: tab.projectId }),
        window.mindforest.tree.listClusters({ projectId: tab.projectId })
      ])
      patchTab(tabId, {
        nodes,
        clusters,
        membership: buildMembership(clusters),
        loaded: true
      })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  }

  const restoreTabPath = async (tabId: string): Promise<void> => {
    const tab = findTab(tabId)
    const focus = tab?.previewNodeId ?? tab?.activeNodeId
    if (!tab || !focus) return
    try {
      const pathNodes = await window.mindforest.tree.getPath({ nodeId: focus })
      patchTab(tabId, { pathNodes })
    } catch {
      patchTab(tabId, { pathNodes: [], previewNodeId: null, activeNodeId: null })
    }
  }

  const ensureTabLoaded = async (tabId: string): Promise<void> => {
    const tab = findTab(tabId)
    if (!tab) return
    if (!tab.loaded) {
      await loadTabTree(tabId)
      await restoreTabPath(tabId)
    }
  }

  const cancelTabStream = (tab: TabState | null): void => {
    if (!tab?.streaming) return
    void window.mindforest.chat.cancel({ requestId: tab.streaming.requestId }).catch(() => undefined)
  }

  const activateTabInternal = async (tabId: string): Promise<void> => {
    set({ activeTabId: tabId })
    persistTabs()
    await ensureTabLoaded(tabId)
  }

  const runNodeMutation = async (
    action: (tab: TabState) => Promise<unknown>,
    options: { refreshPath?: boolean } = {}
  ): Promise<void> => {
    const tab = getActiveTab()
    if (!tab) return
    try {
      await action(tab)
      await loadTabTree(tab.id)
      if (options.refreshPath) {
        const current = findTab(tab.id)
        if (current?.previewNodeId) {
          const pathNodes = await window.mindforest.tree.getPath({
            nodeId: current.previewNodeId
          })
          patchTab(tab.id, { pathNodes })
        }
      }
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  }

  return {
    initialized: false,
    info: null,
    migrationReport: null,
    projects: [],
    tabs: [],
    activeTabId: null,
    profiles: [],
    taskPreferences: DEFAULT_TASK_PREFERENCES,
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

        const projectIds = new Set(projects.map((project) => project.id))
        const stored = readStoredTabs()
        const restored = stored.tabs.filter((tab) => projectIds.has(tab.projectId))
        let tabs: TabState[] = restored.map((tab) =>
          makeTab(tab.id, tab.projectId)
        )
        tabs = tabs.map((tab, index) => ({
          ...tab,
          activeNodeId: restored[index]?.activeNodeId ?? null,
          previewNodeId: restored[index]?.previewNodeId ?? null
        }))
        if (tabs.length === 0 && projects.length > 0) {
          tabs = [makeTab(newTabId(), projects[0]!.id)]
        }
        const activeTabId =
          restored.some((tab) => tab.id === stored.activeTabId) && stored.activeTabId
            ? stored.activeTabId
            : (tabs[0]?.id ?? null)

        set({
          info,
          projects,
          profiles,
          preferences,
          taskPreferences,
          migrationReport,
          tabs,
          activeTabId,
          initialized: true,
          error: null
        })
        if (activeTabId) await get().activateTab(activeTabId)
        persistTabs()
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
        await get().openProjectTab(project.id)
      } catch (error) {
        set({ error: errorMessage(error) })
      }
    },

    renameProject: async (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      try {
        const project = await window.mindforest.projects.rename({ id, name: trimmed })
        set((state) => ({
          projects: state.projects.map((item) => (item.id === project.id ? project : item)),
          error: null
        }))
      } catch (error) {
        set({ error: errorMessage(error) })
      }
    },

    deleteProject: async (id) => {
      try {
        await window.mindforest.projects.delete({ id })
        const projects = await window.mindforest.projects.list()
        const doomed = get().tabs.filter((tab) => tab.projectId === id)
        for (const tab of doomed) cancelTabStream(tab)
        let tabs = get().tabs.filter((tab) => tab.projectId !== id)
        let activeTabId = get().activeTabId
        if (activeTabId && doomed.some((tab) => tab.id === activeTabId)) {
          activeTabId = tabs[0]?.id ?? null
        }
        if (tabs.length === 0 && projects.length > 0) {
          tabs = [makeTab(newTabId(), projects[0]!.id)]
          activeTabId = tabs[0]!.id
        }
        set({ projects, tabs, activeTabId, error: null })
        persistTabs()
        if (activeTabId) await ensureTabLoaded(activeTabId)
      } catch (error) {
        set({ error: errorMessage(error) })
      }
    },

    openProjectTab: async (projectId) => {
      const existing = get().tabs.find((tab) => tab.projectId === projectId)
      if (existing) {
        await get().activateTab(existing.id)
        return
      }
      const id = newTabId()
      set((state) => ({
        tabs: [...state.tabs, makeTab(id, projectId)],
        activeTabId: id,
        error: null
      }))
      await ensureTabLoaded(id)
      persistTabs()
    },

    newTab: async () => {
      const current = getActiveTab()
      const projectId = current?.projectId ?? get().projects[0]?.id
      if (!projectId) return
      const id = newTabId()
      set((state) => ({
        tabs: [...state.tabs, makeTab(id, projectId)],
        activeTabId: id
      }))
      persistTabs()
    },

    closeTab: async (tabId) => {
      const state = get()
      const index = state.tabs.findIndex((tab) => tab.id === tabId)
      if (index < 0) return
      cancelTabStream(state.tabs[index]!)
      const tabs = state.tabs.filter((tab) => tab.id !== tabId)
      let activeTabId = state.activeTabId
      if (activeTabId === tabId) {
        const next = tabs[Math.min(index, tabs.length - 1)]
        activeTabId = next?.id ?? null
      }
      set({ tabs, activeTabId })
      persistTabs()
      if (activeTabId) await ensureTabLoaded(activeTabId)
    },

    closeOtherTabs: async (tabId) => {
      const state = get()
      const keep = state.tabs.find((tab) => tab.id === tabId)
      if (!keep) return
      for (const tab of state.tabs) {
        if (tab.id !== tabId) cancelTabStream(tab)
      }
      set({ tabs: [keep], activeTabId: tabId })
      persistTabs()
      await ensureTabLoaded(tabId)
    },

    activateTab: async (tabId) => {
      if (get().activeTabId === tabId) {
        await ensureTabLoaded(tabId)
        return
      }
      await activateTabInternal(tabId)
    },

    cycleTab: async (direction) => {
      const { tabs, activeTabId } = get()
      if (tabs.length < 2) return
      const index = tabs.findIndex((tab) => tab.id === activeTabId)
      const next = (index + direction + tabs.length) % tabs.length
      await activateTabInternal(tabs[next]!.id)
    },

    reloadTree: async () => {
      const tab = getActiveTab()
      if (tab) await loadTabTree(tab.id)
    },

    openNode: async (nodeId, mode) => {
      const tab = getActiveTab()
      if (!tab) return
      try {
        const pathNodes = await window.mindforest.tree.getPath({ nodeId })
        patchTab(tab.id, {
          pathNodes,
          previewNodeId: nodeId,
          activeNodeId: mode === 'enter' ? nodeId : tab.activeNodeId
        })
        persistTabs()
        set({ error: null })
      } catch (error) {
        set({ error: errorMessage(error) })
      }
    },

    enterFromPreview: async () => {
      const tab = getActiveTab()
      if (!tab?.previewNodeId) return
      patchTab(tab.id, { activeNodeId: tab.previewNodeId })
      persistTabs()
    },

    closeNode: () => {
      const tab = getActiveTab()
      if (!tab) return
      patchTab(tab.id, { previewNodeId: null, pathNodes: [] })
      persistTabs()
    },

    sendMessage: async (content) => {
      const tab = getActiveTab()
      if (!tab || tab.streaming) return
      set({ busy: true })
      try {
        const result = await window.mindforest.chat.send({
          projectId: tab.projectId,
          parentId: tab.activeNodeId,
          content,
          quotes: tab.pendingQuotes.length > 0 ? tab.pendingQuotes : undefined
        })
        streamBuffers.set(tab.id, '')
        patchTab(tab.id, {
          pendingQuotes: [],
          streaming: { requestId: result.requestId, nodeId: result.node.id },
          streamContent: '',
          activeNodeId: result.node.id,
          previewNodeId: result.node.id
        })
        persistTabs()
        await loadTabTree(tab.id)
        const pathNodes = await window.mindforest.tree.getPath({ nodeId: result.node.id })
        patchTab(tab.id, { pathNodes })
        set({ error: null })
      } catch (error) {
        set({ error: errorMessage(error) })
      } finally {
        set({ busy: false })
      }
    },

    regenerate: async (nodeId) => {
      const tab = getActiveTab()
      if (!tab || tab.streaming) return
      set({ busy: true })
      try {
        const result = await window.mindforest.chat.regenerate({ nodeId })
        streamBuffers.set(tab.id, '')
        patchTab(tab.id, {
          streaming: { requestId: result.requestId, nodeId: result.node.id },
          streamContent: '',
          activeNodeId: result.node.id,
          previewNodeId: result.node.id
        })
        persistTabs()
        await loadTabTree(tab.id)
        const pathNodes = await window.mindforest.tree.getPath({ nodeId: result.node.id })
        patchTab(tab.id, { pathNodes })
        set({ error: null })
      } catch (error) {
        set({ error: errorMessage(error) })
      } finally {
        set({ busy: false })
      }
    },

    cancelStream: async () => {
      const tab = getActiveTab()
      if (!tab?.streaming) return
      try {
        await window.mindforest.chat.cancel({ requestId: tab.streaming.requestId })
      } catch (error) {
        set({ error: errorMessage(error) })
      }
    },

    applyDelta: (event) => {
      const tab = get().tabs.find((item) => item.streaming?.requestId === event.requestId)
      if (!tab) return
      const buffer = (streamBuffers.get(tab.id) ?? '') + event.delta
      streamBuffers.set(tab.id, buffer)
      if (flushHandles.has(tab.id)) return
      const handle = requestAnimationFrame(() => {
        flushHandles.delete(tab.id)
        patchTab(tab.id, { streamContent: streamBuffers.get(tab.id) ?? '' })
      })
      flushHandles.set(tab.id, handle)
    },

    applyChatResult: (event) => {
      const tab = get().tabs.find((item) => item.streaming?.requestId === event.requestId)
      if (!tab) return
      const handle = flushHandles.get(tab.id)
      if (handle !== undefined) {
        cancelAnimationFrame(handle)
        flushHandles.delete(tab.id)
      }
      streamBuffers.delete(tab.id)
      const node = event.node as TurnNode
      set((state) => ({
        tabs: state.tabs.map((item) =>
          item.id === tab.id
            ? {
                ...item,
                pathNodes: item.pathNodes.map((entry) =>
                  entry.id === node.id ? { ...entry, ...node } : entry
                ),
                nodes: item.nodes.map((meta) =>
                  meta.id === node.id
                    ? {
                        ...meta,
                        assistantStatus: node.assistantStatus,
                        assistantError: node.assistantError,
                        model: node.model
                      }
                    : meta
                ),
                streaming: null,
                streamContent: ''
              }
            : item
        ),
        error:
          node.assistantStatus === 'error' ? (node.assistantError ?? '生成失败') : state.error
      }))
      void loadTabTree(tab.id)
    },

    editNode: async (nodeId, content, syncGroup) => {
      await runNodeMutation(
        () => window.mindforest.tree.editNode({ nodeId, content, syncGroup }),
        { refreshPath: true }
      )
    },

    renameNode: async (nodeId, title) => {
      const tab = getActiveTab()
      if (!tab) return
      try {
        const node = await window.mindforest.tree.renameNode({ nodeId, title })
        patchTab(tab.id, {
          nodes: tab.nodes.map((meta) =>
            meta.id === node.id
              ? { ...meta, title: node.title, titleGenerated: node.titleGenerated }
              : meta
          ),
          pathNodes: tab.pathNodes.map((entry) =>
            entry.id === node.id
              ? { ...entry, title: node.title, titleGenerated: node.titleGenerated }
              : entry
          )
        })
        set({ error: null })
      } catch (error) {
        set({ error: errorMessage(error) })
      }
    },

    generateNodeTitle: async (nodeId) => {
      const tab = getActiveTab()
      if (!tab) return
      try {
        const node = await window.mindforest.tree.generateNodeTitle({ nodeId })
        patchTab(tab.id, {
          nodes: tab.nodes.map((meta) =>
            meta.id === node.id
              ? { ...meta, title: node.title, titleGenerated: node.titleGenerated }
              : meta
          ),
          pathNodes: tab.pathNodes.map((entry) =>
            entry.id === node.id
              ? { ...entry, title: node.title, titleGenerated: node.titleGenerated }
              : entry
          )
        })
        set({ error: null })
      } catch (error) {
        set({ error: errorMessage(error) })
      }
    },

    deleteNode: async (nodeId) => {
      const tab = getActiveTab()
      if (!tab) return
      try {
        await window.mindforest.tree.deleteNode({ nodeId })
        const subtree = collectSubtreeIds(tab.nodes, nodeId)
        const affected = tab.pathNodes.some((entry) => subtree.has(entry.id))
        if (affected) {
          patchTab(tab.id, { previewNodeId: null, activeNodeId: null, pathNodes: [] })
          persistTabs()
        }
        await loadTabTree(tab.id)
        set({ error: null })
      } catch (error) {
        set({ error: errorMessage(error) })
      }
    },

    restoreNode: async (nodeId) => {
      await runNodeMutation(() => window.mindforest.tree.restoreNode({ nodeId }))
    },

    purgeNode: async (nodeId) => {
      await runNodeMutation(() => window.mindforest.tree.purgeNode({ nodeId }))
    },

    setMainBranch: async (nodeId) => {
      await runNodeMutation(() => window.mindforest.tree.setMainBranch({ nodeId }))
    },

    setArchived: async (nodeId, archived) => {
      await runNodeMutation(() => window.mindforest.tree.setArchived({ nodeId, archived }))
    },

    setCollapsed: async (nodeId, collapsed) => {
      await runNodeMutation(() => window.mindforest.tree.setCollapsed({ nodeId, collapsed }))
    },

    toggleAnswerCollapsed: async (nodeId) => {
      const tab = getActiveTab()
      const entry = tab?.pathNodes.find((item) => item.id === nodeId)
      if (!tab || !entry) return
      const collapsed = !entry.answerCollapsed
      patchTab(tab.id, {
        pathNodes: tab.pathNodes.map((item) =>
          item.id === nodeId ? { ...item, answerCollapsed: collapsed } : item
        )
      })
      try {
        await window.mindforest.tree.setAnswerCollapsed({ nodeId, collapsed })
        set({ error: null })
      } catch (error) {
        patchTab(tab.id, {
          pathNodes: get()
            .tabs.find((item) => item.id === tab.id)!
            .pathNodes.map((item) =>
              item.id === nodeId ? { ...item, answerCollapsed: !collapsed } : item
            )
        })
        set({ error: errorMessage(error) })
      }
    },

    setUserCollapsed: async (nodeId, collapsed) => {
      const tab = getActiveTab()
      const entry = tab?.pathNodes.find((item) => item.id === nodeId)
      if (!tab || !entry) return
      const previous = entry.userCollapsed
      patchTab(tab.id, {
        pathNodes: tab.pathNodes.map((item) =>
          item.id === nodeId ? { ...item, userCollapsed: collapsed } : item
        )
      })
      try {
        await window.mindforest.tree.setUserCollapsed({ nodeId, collapsed })
        set({ error: null })
      } catch (error) {
        patchTab(tab.id, {
          pathNodes: get()
            .tabs.find((item) => item.id === tab.id)!
            .pathNodes.map((item) =>
              item.id === nodeId ? { ...item, userCollapsed: previous } : item
            )
        })
        set({ error: errorMessage(error) })
      }
    },

    saveHistory: async (format) => {
      const tab = getActiveTab()
      if (!tab) return null
      const nodeId = tab.previewNodeId ?? tab.activeNodeId ?? undefined
      if (format === 'markdown' && !nodeId) {
        set({ error: '请先选择一个对话节点再导出' })
        return null
      }
      try {
        const result = await window.mindforest.export.saveHistory({
          projectId: tab.projectId,
          nodeId: format === 'markdown' ? nodeId : undefined,
          format
        })
        set({ error: null })
        return result
      } catch (error) {
        set({ error: errorMessage(error) })
        return null
      }
    },

    setSelection: (ids) => {
      const tab = getActiveTab()
      if (tab) patchTab(tab.id, { selectedNodeIds: ids })
    },

    toggleNodeSelection: (nodeId) => {
      const tab = getActiveTab()
      if (!tab) return
      const selected = tab.selectedNodeIds.includes(nodeId)
        ? tab.selectedNodeIds.filter((id) => id !== nodeId)
        : [...tab.selectedNodeIds, nodeId]
      patchTab(tab.id, { selectedNodeIds: selected })
    },

    clearSelection: () => {
      const tab = getActiveTab()
      if (tab) patchTab(tab.id, { selectedNodeIds: [] })
    },

    createClusterFromSelection: async () => {
      const tab = getActiveTab()
      if (!tab || tab.selectedNodeIds.length === 0) return
      try {
        const { cluster, addedNodeCount } = await window.mindforest.tree.createCluster({
          projectId: tab.projectId,
          nodeIds: tab.selectedNodeIds
        })
        patchTab(tab.id, { selectedNodeIds: [] })
        set({
          notice:
            addedNodeCount > 0
              ? `已创建主题「${cluster.title}」，自动包含 ${addedNodeCount} 个中间节点`
              : `已创建主题「${cluster.title}」`,
          error: null
        })
        await loadTabTree(tab.id)
      } catch (error) {
        set({ error: errorMessage(error) })
      }
    },

    renameCluster: async (id, title) => {
      await runNodeMutation(() => window.mindforest.tree.renameCluster({ id, title }))
    },

    summarizeCluster: async (id) => {
      if (get().clusterSummarizing.includes(id)) return
      set((state) => ({ clusterSummarizing: [...state.clusterSummarizing, id] }))
      try {
        await window.mindforest.tree.summarizeCluster({ id })
        const tab = getActiveTab()
        if (tab) await loadTabTree(tab.id)
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
      await runNodeMutation(() => window.mindforest.tree.setClusterCollapsed({ id, collapsed }))
    },

    deleteCluster: async (id) => {
      await runNodeMutation(() => window.mindforest.tree.deleteCluster({ id }))
    },

    applyClusterUpdated: (cluster) => {
      set((state) => ({
        tabs: state.tabs.map((tab) => {
          if (!tab.clusters.some((item) => item.id === cluster.id)) return tab
          const clusters = tab.clusters.map((item) =>
            item.id === cluster.id ? cluster : item
          )
          return { ...tab, clusters, membership: buildMembership(clusters) }
        })
      }))
    },

    addPendingQuote: (quote) => {
      const tab = getActiveTab()
      if (!tab || tab.pendingQuotes.length >= 5) return
      patchTab(tab.id, { pendingQuotes: [...tab.pendingQuotes, quote] })
    },

    removePendingQuote: (index) => {
      const tab = getActiveTab()
      if (!tab) return
      patchTab(tab.id, {
        pendingQuotes: tab.pendingQuotes.filter((_, i) => i !== index)
      })
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
  }
})

export function useActiveTab(): TabState {
  return useAppStore(
    (state) => state.tabs.find((tab) => tab.id === state.activeTabId) ?? EMPTY_TAB
  )
}

export function useEffectiveMode(): 'light' | 'dark' {
  const mode = useAppStore((state) => state.preferences.mode)
  const systemDark = useAppStore((state) => state.systemDark)
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
}
