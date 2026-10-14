import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MindForestApi } from '@shared/api'
import type {
  ChatDeltaEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  ClusterWithMembers
} from '@shared/types'
import { IPC } from '@shared/ipc'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: MindForestApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.appGetInfo),
    openDataDir: () => ipcRenderer.invoke(IPC.appOpenDataDir),
    migrationReport: () => ipcRenderer.invoke(IPC.appMigrationReport)
  },
  settings: {
    get: (input) => ipcRenderer.invoke(IPC.settingsGet, input),
    set: (input) => ipcRenderer.invoke(IPC.settingsSet, input)
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC.projectsList),
    create: (input) => ipcRenderer.invoke(IPC.projectsCreate, input),
    rename: (input) => ipcRenderer.invoke(IPC.projectsRename, input),
    delete: (input) => ipcRenderer.invoke(IPC.projectsDelete, input)
  },
  tree: {
    listNodes: (input) => ipcRenderer.invoke(IPC.treeListNodes, input),
    getPath: (input) => ipcRenderer.invoke(IPC.treeGetPath, input),
    listClusters: (input) => ipcRenderer.invoke(IPC.treeListClusters, input),
    createCluster: (input) => ipcRenderer.invoke(IPC.treeCreateCluster, input),
    renameCluster: (input) => ipcRenderer.invoke(IPC.treeRenameCluster, input),
    summarizeCluster: (input) => ipcRenderer.invoke(IPC.treeSummarizeCluster, input),
    setClusterCollapsed: (input) => ipcRenderer.invoke(IPC.treeSetClusterCollapsed, input),
    deleteCluster: (input) => ipcRenderer.invoke(IPC.treeDeleteCluster, input),
    setMainBranch: (input) => ipcRenderer.invoke(IPC.treeSetMainBranch, input),
    setArchived: (input) => ipcRenderer.invoke(IPC.treeSetArchived, input),
    setCollapsed: (input) => ipcRenderer.invoke(IPC.treeSetCollapsed, input),
    setAnswerCollapsed: (input) => ipcRenderer.invoke(IPC.treeSetAnswerCollapsed, input),
    deleteNode: (input) => ipcRenderer.invoke(IPC.treeDeleteNode, input),
    restoreNode: (input) => ipcRenderer.invoke(IPC.treeRestoreNode, input),
    purgeNode: (input) => ipcRenderer.invoke(IPC.treePurgeNode, input),
    listDeleted: (input) => ipcRenderer.invoke(IPC.treeListDeleted, input),
    editNode: (input) => ipcRenderer.invoke(IPC.treeEditNode, input),
    onClusterUpdated: (callback: (cluster: ClusterWithMembers) => void) =>
      subscribe(IPC.treeClusterUpdated, callback)
  },
  llmProfiles: {
    list: () => ipcRenderer.invoke(IPC.llmProfilesList),
    create: (input) => ipcRenderer.invoke(IPC.llmProfilesCreate, input),
    update: (input) => ipcRenderer.invoke(IPC.llmProfilesUpdate, input),
    remove: (input) => ipcRenderer.invoke(IPC.llmProfilesRemove, input),
    setActive: (input) => ipcRenderer.invoke(IPC.llmProfilesSetActive, input),
    test: (input) => ipcRenderer.invoke(IPC.llmProfilesTest, input)
  },
  chat: {
    send: (input) => ipcRenderer.invoke(IPC.chatSend, input),
    regenerate: (input) => ipcRenderer.invoke(IPC.chatRegenerate, input),
    cancel: (input) => ipcRenderer.invoke(IPC.chatCancel, input),
    onDelta: (callback: (event: ChatDeltaEvent) => void) => subscribe(IPC.chatDelta, callback),
    onDone: (callback: (event: ChatDoneEvent) => void) => subscribe(IPC.chatDone, callback),
    onError: (callback: (event: ChatErrorEvent) => void) => subscribe(IPC.chatError, callback)
  },
  export: {
    saveHistory: (input) => ipcRenderer.invoke(IPC.exportSaveHistory, input)
  }
}

contextBridge.exposeInMainWorld('mindforest', api)
