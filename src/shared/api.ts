import type {
  AppInfo,
  Card,
  ChatDeltaEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  ChatSendResult,
  Conversation,
  EditMessageResult,
  LlmProfile,
  LlmProfileInput,
  LlmProfileTestResult,
  Message,
  MessageQuote,
  Project,
  QuoteInput
} from './types'

export interface MindForestApi {
  app: {
    getInfo(): Promise<AppInfo>
  }
  projects: {
    list(): Promise<Project[]>
    create(input: { name: string }): Promise<{ project: Project; rootCard: Card }>
    rename(input: { id: string; name: string }): Promise<Project>
    delete(input: { id: string }): Promise<void>
  }
  cards: {
    listByProject(input: { projectId: string }): Promise<Card[]>
    createChild(input: { parentCardId: string; title?: string }): Promise<Card>
    createBranch(input: {
      sourceCardId: string
      fromMessageId: string
      title?: string
    }): Promise<Card>
    rename(input: { id: string; title: string }): Promise<Card>
    delete(input: { id: string }): Promise<void>
  }
  conversations: {
    getByCard(input: { cardId: string }): Promise<Conversation>
  }
  messages: {
    list(input: { conversationId: string }): Promise<Message[]>
    appendUser(input: { conversationId: string; content: string }): Promise<Message>
    deleteTurn(input: { conversationId: string; turnIndex: number }): Promise<void>
    edit(input: { id: string; content: string }): Promise<EditMessageResult>
    setActiveVariant(input: { id: string }): Promise<void>
  }
  quotes: {
    listByConversation(input: { conversationId: string }): Promise<MessageQuote[]>
  }
  llmProfiles: {
    list(): Promise<LlmProfile[]>
    create(input: LlmProfileInput): Promise<LlmProfile>
    update(input: { id: string } & Partial<LlmProfileInput>): Promise<LlmProfile>
    remove(input: { id: string }): Promise<void>
    setActive(input: { id: string }): Promise<LlmProfile>
    test(input: { id: string }): Promise<LlmProfileTestResult>
  }
  chat: {
    send(input: {
      conversationId: string
      content: string
      quotes?: QuoteInput[]
    }): Promise<ChatSendResult>
    regenerate(input: { conversationId: string; turnIndex: number }): Promise<ChatSendResult>
    cancel(input: { requestId: string }): Promise<void>
    onDelta(callback: (event: ChatDeltaEvent) => void): () => void
    onDone(callback: (event: ChatDoneEvent) => void): () => void
    onError(callback: (event: ChatErrorEvent) => void): () => void
  }
}
