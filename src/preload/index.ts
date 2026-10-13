import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MindForestApi } from '@shared/api'
import type { ChatDeltaEvent, ChatDoneEvent, ChatErrorEvent } from '@shared/types'
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
    openDataDir: () => ipcRenderer.invoke(IPC.appOpenDataDir)
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
  cards: {
    listByProject: (input) => ipcRenderer.invoke(IPC.cardsListByProject, input),
    createChild: (input) => ipcRenderer.invoke(IPC.cardsCreateChild, input),
    createBranch: (input) => ipcRenderer.invoke(IPC.cardsCreateBranch, input),
    rename: (input) => ipcRenderer.invoke(IPC.cardsRename, input),
    delete: (input) => ipcRenderer.invoke(IPC.cardsDelete, input)
  },
  conversations: {
    getByCard: (input) => ipcRenderer.invoke(IPC.conversationsGetByCard, input)
  },
  messages: {
    list: (input) => ipcRenderer.invoke(IPC.messagesList, input),
    appendUser: (input) => ipcRenderer.invoke(IPC.messagesAppendUser, input),
    deleteTurn: (input) => ipcRenderer.invoke(IPC.messagesDeleteTurn, input),
    edit: (input) => ipcRenderer.invoke(IPC.messagesEdit, input),
    setActiveVariant: (input) => ipcRenderer.invoke(IPC.messagesSetActiveVariant, input)
  },
  quotes: {
    listByConversation: (input) => ipcRenderer.invoke(IPC.quotesListByConversation, input)
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
  }
}

contextBridge.exposeInMainWorld('mindforest', api)
