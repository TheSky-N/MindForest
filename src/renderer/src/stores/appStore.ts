import { create } from 'zustand'
import type {
  AppInfo,
  Card,
  ChatDeltaEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  Conversation,
  EditMessageResult,
  LlmProfile,
  LlmProfileInput,
  LlmProfileTestResult,
  Message,
  MessageQuote,
  Project,
  QuoteInput
} from '@shared/types'

interface AppState {
  initialized: boolean
  info: AppInfo | null
  projects: Project[]
  activeProjectId: string | null
  cards: Card[]
  activeCardId: string | null
  conversation: Conversation | null
  messages: Message[]
  quotesByMessage: Record<string, MessageQuote[]>
  pendingQuotes: QuoteInput[]
  profiles: LlmProfile[]
  streaming: { requestId: string; messageId: string; conversationId: string } | null
  streamContent: string
  error: string | null
  busy: boolean
  initialize: () => Promise<void>
  createProject: (name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  selectProject: (id: string) => Promise<void>
  selectCard: (id: string) => Promise<void>
  reloadConversation: () => Promise<void>
  refreshCards: (projectId: string) => Promise<Card[]>
  createChildCard: (parentCardId: string) => Promise<void>
  createBranchCard: (fromMessageId: string) => Promise<void>
  renameCard: (id: string, title: string) => Promise<void>
  deleteCard: (id: string) => Promise<void>
  deleteTurn: (turnIndex: number) => Promise<void>
  editMessage: (messageId: string, content: string) => Promise<EditMessageResult | null>
  setActiveVariant: (messageId: string) => Promise<void>
  addPendingQuote: (quote: QuoteInput) => void
  removePendingQuote: (index: number) => void
  clearPendingQuotes: () => void
  sendMessage: (content: string) => Promise<void>
  regenerate: (turnIndex: number) => Promise<void>
  cancelStream: () => Promise<void>
  applyDelta: (event: ChatDeltaEvent) => void
  applyChatResult: (event: ChatDoneEvent | ChatErrorEvent) => void
  loadProfiles: () => Promise<void>
  createProfile: (input: LlmProfileInput) => Promise<LlmProfile | null>
  updateProfile: (id: string, patch: Partial<LlmProfileInput>) => Promise<LlmProfile | null>
  removeProfile: (id: string) => Promise<void>
  setActiveProfile: (id: string) => Promise<void>
  testProfile: (id: string) => Promise<LlmProfileTestResult>
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

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  info: null,
  projects: [],
  activeProjectId: null,
  cards: [],
  activeCardId: null,
  conversation: null,
  messages: [],
  quotesByMessage: {},
  pendingQuotes: [],
  profiles: [],
  streaming: null,
  streamContent: '',
  error: null,
  busy: false,

  initialize: async () => {
    set({ busy: true })
    try {
      const [info, projects, profiles] = await Promise.all([
        window.mindforest.app.getInfo(),
        window.mindforest.projects.list(),
        window.mindforest.llmProfiles.list()
      ])
      set({ info, projects, profiles, initialized: true, error: null })
      if (projects.length > 0) await get().selectProject(projects[0]!.id)
    } catch (error) {
      set({ error: errorMessage(error), initialized: true })
    } finally {
      set({ busy: false })
    }
  },

  createProject: async (name) => {
    try {
      const { project, rootCard } = await window.mindforest.projects.create({ name })
      set((state) => ({ projects: [project, ...state.projects], error: null }))
      await get().selectProject(project.id)
      await get().selectCard(rootCard.id)
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
          cards: [],
          activeCardId: null,
          conversation: null,
          messages: [],
          quotesByMessage: {},
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
      const cards = await window.mindforest.cards.listByProject({ projectId: id })
      const root = cards.find((card) => card.kind === 'root') ?? cards[0]
      set({
        activeProjectId: id,
        cards,
        activeCardId: null,
        conversation: null,
        messages: [],
        quotesByMessage: {},
        pendingQuotes: [],
        error: null
      })
      if (root) await get().selectCard(root.id)
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  selectCard: async (id) => {
    try {
      const card = get().cards.find((item) => item.id === id)
      if (!card) return
      const conversation = await window.mindforest.conversations.getByCard({ cardId: id })
      set({
        activeCardId: id,
        conversation,
        messages: [],
        quotesByMessage: {},
        pendingQuotes: [],
        error: null
      })
      await get().reloadConversation()
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  reloadConversation: async () => {
    const conversation = get().conversation
    if (!conversation) return
    const [messages, quotes] = await Promise.all([
      window.mindforest.messages.list({ conversationId: conversation.id }),
      window.mindforest.quotes.listByConversation({ conversationId: conversation.id })
    ])
    const quotesByMessage: Record<string, MessageQuote[]> = {}
    for (const quote of quotes) {
      const list = quotesByMessage[quote.messageId] ?? []
      list.push(quote)
      quotesByMessage[quote.messageId] = list
    }
    set({ messages, quotesByMessage })
  },

  refreshCards: async (projectId) => {
    const cards = await window.mindforest.cards.listByProject({ projectId })
    set({ cards })
    return cards
  },

  createChildCard: async (parentCardId) => {
    try {
      const card = await window.mindforest.cards.createChild({ parentCardId })
      await get().refreshCards(card.projectId)
      await get().selectCard(card.id)
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  createBranchCard: async (fromMessageId) => {
    const sourceCardId = get().activeCardId
    if (!sourceCardId) return
    try {
      const card = await window.mindforest.cards.createBranch({ sourceCardId, fromMessageId })
      await get().refreshCards(card.projectId)
      await get().selectCard(card.id)
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  renameCard: async (id, title) => {
    try {
      const updated = await window.mindforest.cards.rename({ id, title })
      set((state) => ({
        cards: state.cards.map((card) => (card.id === updated.id ? updated : card)),
        error: null
      }))
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  deleteCard: async (id) => {
    try {
      await window.mindforest.cards.delete({ id })
      const projectId = get().activeProjectId
      if (!projectId) return
      const cards = await get().refreshCards(projectId)
      const activeCardId = get().activeCardId
      if (!cards.some((card) => card.id === activeCardId)) {
        const root = cards.find((card) => card.kind === 'root') ?? cards[0]
        if (root) await get().selectCard(root.id)
      }
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  deleteTurn: async (turnIndex) => {
    const conversation = get().conversation
    if (!conversation) return
    try {
      await window.mindforest.messages.deleteTurn({ conversationId: conversation.id, turnIndex })
      await get().reloadConversation()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  editMessage: async (messageId, content) => {
    try {
      const result = await window.mindforest.messages.edit({ id: messageId, content })
      await get().reloadConversation()
      set({ error: null })
      return result
    } catch (error) {
      set({ error: errorMessage(error) })
      return null
    }
  },

  setActiveVariant: async (messageId) => {
    try {
      await window.mindforest.messages.setActiveVariant({ id: messageId })
      await get().reloadConversation()
      set({ error: null })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
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

  clearPendingQuotes: () => set({ pendingQuotes: [] }),

  sendMessage: async (content) => {
    const conversation = get().conversation
    if (!conversation || get().streaming) return
    const quotes = get().pendingQuotes
    set({ busy: true })
    try {
      const result = await window.mindforest.chat.send({
        conversationId: conversation.id,
        content,
        quotes: quotes.length > 0 ? quotes : undefined
      })
      streamBuffer = ''
      set((state) => ({
        pendingQuotes: [],
        messages: [
          ...state.messages.filter(
            (message) =>
              message.id !== result.userMessage.id && message.id !== result.assistantMessage.id
          ),
          result.userMessage,
          result.assistantMessage
        ],
        streaming: {
          requestId: result.requestId,
          messageId: result.assistantMessage.id,
          conversationId: conversation.id
        },
        streamContent: '',
        error: null
      }))
      await get().reloadConversation()
    } catch (error) {
      set({ error: errorMessage(error) })
    } finally {
      set({ busy: false })
    }
  },

  regenerate: async (turnIndex) => {
    const conversation = get().conversation
    if (!conversation || get().streaming) return
    set({ busy: true })
    try {
      const result = await window.mindforest.chat.regenerate({
        conversationId: conversation.id,
        turnIndex
      })
      streamBuffer = ''
      set((state) => ({
        messages: [
          ...state.messages.map((message) =>
            message.role === 'assistant' && message.turnIndex === turnIndex
              ? { ...message, isActiveVariant: false }
              : message
          ),
          result.assistantMessage
        ],
        streaming: {
          requestId: result.requestId,
          messageId: result.assistantMessage.id,
          conversationId: conversation.id
        },
        streamContent: '',
        error: null
      }))
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
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === event.message.id ? event.message : message
      ),
      streaming: wasTracked ? null : streaming,
      streamContent: '',
      error: event.message.status === 'error' ? (event.message.errorMessage ?? '生成失败') : null
    }))
    if (wasTracked) void get().reloadConversation()
  },

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

  clearError: () => set({ error: null })
}))
