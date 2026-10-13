import { app, ipcMain, shell, type WebContents } from 'electron'
import { dirname } from 'node:path'
import { IPC } from '@shared/ipc'
import type { ChatDeltaEvent, ChatDoneEvent, ChatErrorEvent, LlmProfile, LlmProfileInput, QuoteInput } from '@shared/types'
import type { AppDatabase } from '../db/client'
import { getDatabasePath } from '../db'
import { createProjectRepository } from '../db/repositories/projects'
import { createCardRepository } from '../db/repositories/cards'
import { createConversationRepository } from '../db/repositories/conversations'
import { createMessageRepository } from '../db/repositories/messages'
import { createLlmProfileRepository } from '../db/repositories/llmProfiles'
import { createQuoteRepository } from '../db/repositories/quotes'
import { createSettingsRepository } from '../db/repositories/settings'
import { buildBranchContext } from '../context/branchContext'
import { isSecureStorageAvailable } from '../secureStore'
import { clearApiKey, getApiKey, hasSessionApiKey, storeApiKey } from '../security/apiKeys'
import { createChatService, type ChatEventSink, type RuntimeProfile } from '../chat/chatService'
import { editUserMessage } from '../chat/conversationService'
import { completeChat } from '../llm/client'
import { refreshCardSummaryIfNeeded } from '../llm/summaryService'
import { generateCardTitle } from '../llm/titleService'
import { normalizeTaskPreferences } from '@shared/types'

function safeSend(sender: WebContents, channel: string, payload: unknown): void {
  if (sender.isDestroyed()) return
  sender.send(channel, payload)
}

export function registerIpcHandlers(options: { db: AppDatabase }): void {
  const { db } = options
  const projects = createProjectRepository(db)
  const cards = createCardRepository(db)
  const conversations = createConversationRepository(db)
  const messages = createMessageRepository(db)
  const profiles = createLlmProfileRepository(db)
  const quotes = createQuoteRepository(db)
  const settings = createSettingsRepository(db)

  const scheduleCardSummary = (cardId: string): void => {
    try {
      if (cards.countChildren(cardId) === 0) return
      const profile = resolveTaskProfile()
      void refreshCardSummaryIfNeeded({ db, cardId, profile }).catch(() => undefined)
    } catch {
      void 0
    }
  }

  const TASK_PREFERENCES_KEY = 'preferences.tasks'

  function resolveTaskProfile(): RuntimeProfile {
    let preferredId = ''
    try {
      const raw = settings.get(TASK_PREFERENCES_KEY)
      if (raw) preferredId = normalizeTaskPreferences(JSON.parse(raw)).summaryProfileId
    } catch {
      preferredId = ''
    }
    const row = (preferredId ? profiles.getRow(preferredId) : undefined) ?? profiles.getActiveRow()
    if (!row) throw new Error('请先在「模型设置」中配置并启用一个模型')
    const apiKey = getApiKey(row.id, row.apiKeyEncrypted) ?? undefined
    return { baseUrl: row.baseUrl, model: row.model, temperature: row.temperature, apiKey }
  }

  const titleInFlight = new Set<string>()

  const scheduleAutoTitle = (cardId: string, sender: WebContents): void => {
    try {
      const card = cards.get(cardId)
      if (!card || card.titleGenerated || titleInFlight.has(cardId)) return
      const conversation = conversations.getByCard(cardId)
      if (!conversation) return
      const rows = messages.listByConversation(conversation.id)
      if (!rows.some((message) => message.role === 'assistant' && message.status === 'complete')) {
        return
      }
      const profile = resolveTaskProfile()
      titleInFlight.add(cardId)
      void generateCardTitle({ db, cardId, profile })
        .then((updated) => {
          if (updated) safeSend(sender, IPC.cardsTitleUpdated, updated)
        })
        .catch(() => undefined)
        .finally(() => titleInFlight.delete(cardId))
    } catch {
      void 0
    }
  }

  const chatService = createChatService({ db, onTurnSettled: scheduleCardSummary })

  const decorate = (profile: LlmProfile): LlmProfile => ({
    ...profile,
    hasApiKey: profile.hasApiKey || hasSessionApiKey(profile.id)
  })

  const resolveActiveProfile = (): RuntimeProfile => {
    const active = profiles.getActiveRow()
    if (!active) throw new Error('请先在「模型设置」中配置并启用一个模型')
    const apiKey = getApiKey(active.id, active.apiKeyEncrypted) ?? undefined
    return {
      baseUrl: active.baseUrl,
      model: active.model,
      temperature: active.temperature,
      apiKey
    }
  }

  const chatEvents = (sender: WebContents): ChatEventSink => ({
    delta: (payload: ChatDeltaEvent) => safeSend(sender, IPC.chatDelta, payload),
    done: (payload: ChatDoneEvent) => {
      safeSend(sender, IPC.chatDone, payload)
      const conversation = conversations.getById(payload.message.conversationId)
      if (conversation) scheduleAutoTitle(conversation.cardId, sender)
    },
    error: (payload: ChatErrorEvent) => safeSend(sender, IPC.chatError, payload)
  })

  ipcMain.handle(IPC.appGetInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    dbPath: getDatabasePath(),
    secureStorageAvailable: isSecureStorageAvailable()
  }))

  ipcMain.handle(IPC.appOpenDataDir, () => shell.openPath(dirname(getDatabasePath())))

  ipcMain.handle(IPC.settingsGet, (_event, input: { key: string }) =>
    settings.get(input.key) ?? null
  )
  ipcMain.handle(IPC.settingsSet, (_event, input: { key: string; value: string }) => {
    settings.set(input.key, input.value)
  })

  ipcMain.handle(IPC.projectsList, () => projects.list())
  ipcMain.handle(IPC.projectsCreate, (_event, input: { name: string }) =>
    projects.create({ name: input.name.trim() || '未命名项目' })
  )
  ipcMain.handle(IPC.projectsRename, (_event, input: { id: string; name: string }) =>
    projects.rename(input.id, input.name.trim() || '未命名项目')
  )
  ipcMain.handle(IPC.projectsDelete, (_event, input: { id: string }) => projects.delete(input.id))

  ipcMain.handle(IPC.cardsListByProject, (_event, input: { projectId: string }) =>
    cards.listByProject(input.projectId)
  )
  ipcMain.handle(IPC.cardsCreateChild, (_event, input: { parentCardId: string; title?: string }) =>
    cards.createChild(input)
  )
  ipcMain.handle(
    IPC.cardsCreateBranch,
    (_event, input: { sourceCardId: string; fromMessageId?: string | null; title?: string }) => {
      const context = buildBranchContext(db, {
        sourceCardId: input.sourceCardId,
        fromMessageId: input.fromMessageId ?? null
      })
      return cards.createBranch({
        sourceCardId: input.sourceCardId,
        fromMessageId: context.fromMessageId,
        inheritedContext: context.text,
        title: input.title
      })
    }
  )
  ipcMain.handle(IPC.cardsRename, (_event, input: { id: string; title: string }) =>
    cards.rename(input.id, input.title)
  )
  ipcMain.handle(IPC.cardsDelete, (_event, input: { id: string }) => cards.delete(input.id))
  ipcMain.handle(IPC.cardsGenerateTitle, async (_event, input: { id: string }) => {
    const updated = await generateCardTitle({ db, cardId: input.id, profile: resolveTaskProfile() })
    if (!updated) throw new Error('该卡片还没有对话，无法总结主题')
    return updated
  })

  ipcMain.handle(IPC.conversationsGetByCard, (_event, input: { cardId: string }) =>
    conversations.ensureForCard(input.cardId)
  )
  ipcMain.handle(IPC.messagesList, (_event, input: { conversationId: string }) =>
    messages.listByConversation(input.conversationId)
  )
  ipcMain.handle(
    IPC.messagesAppendUser,
    (_event, input: { conversationId: string; content: string }) => messages.appendUser(input)
  )
  ipcMain.handle(
    IPC.messagesDeleteTurn,
    (_event, input: { conversationId: string; turnIndex: number }) =>
      messages.deleteTurn(input.conversationId, input.turnIndex)
  )
  ipcMain.handle(IPC.messagesEdit, (_event, input: { id: string; content: string }) =>
    editUserMessage(db, { messageId: input.id, content: input.content })
  )
  ipcMain.handle(IPC.messagesSetActiveVariant, (_event, input: { id: string }) => {
    messages.setActiveVariant(input.id)
  })
  ipcMain.handle(IPC.quotesListByConversation, (_event, input: { conversationId: string }) =>
    quotes.listByConversation(input.conversationId)
  )

  ipcMain.handle(IPC.llmProfilesList, () => profiles.list().map(decorate))

  ipcMain.handle(IPC.llmProfilesCreate, (_event, input: LlmProfileInput) => {
    let profile = profiles.create({
      name: input.name.trim() || '未命名配置',
      baseUrl: input.baseUrl.trim(),
      model: input.model.trim(),
      temperature: input.temperature,
      apiKeyEncrypted: null
    })
    if (input.apiKey) {
      profile = profiles.update(profile.id, {
        apiKeyEncrypted: storeApiKey(profile.id, input.apiKey)
      })
    }
    if (!profiles.getActiveRow()) {
      profile = profiles.setActive(profile.id)
    }
    return decorate(profile)
  })

  ipcMain.handle(
    IPC.llmProfilesUpdate,
    (_event, input: { id: string } & Partial<LlmProfileInput>) => {
      const patch: {
        name?: string
        baseUrl?: string
        model?: string
        temperature?: number
        apiKeyEncrypted?: string | null
      } = {}
      if (input.name !== undefined) patch.name = input.name.trim() || '未命名配置'
      if (input.baseUrl !== undefined) patch.baseUrl = input.baseUrl.trim()
      if (input.model !== undefined) patch.model = input.model.trim()
      if (input.temperature !== undefined) patch.temperature = input.temperature
      if (input.apiKey !== undefined) {
        if (input.apiKey === '') {
          clearApiKey(input.id)
          patch.apiKeyEncrypted = null
        } else {
          patch.apiKeyEncrypted = storeApiKey(input.id, input.apiKey)
        }
      }
      return decorate(profiles.update(input.id, patch))
    }
  )

  ipcMain.handle(IPC.llmProfilesRemove, (_event, input: { id: string }) => {
    clearApiKey(input.id)
    profiles.remove(input.id)
  })

  ipcMain.handle(IPC.llmProfilesSetActive, (_event, input: { id: string }) =>
    decorate(profiles.setActive(input.id))
  )

  ipcMain.handle(IPC.llmProfilesTest, async (_event, input: { id: string }) => {
    try {
      const row = profiles.getRow(input.id)
      if (!row) throw new Error('模型配置不存在')
      const apiKey = getApiKey(row.id, row.apiKeyEncrypted) ?? undefined
      const reply = await completeChat({
        baseUrl: row.baseUrl,
        model: row.model,
        temperature: row.temperature,
        apiKey,
        messages: [{ role: 'user', content: '请只回复四个字：连接成功' }],
        maxTokens: 32
      })
      return { ok: true, reply: reply.trim() }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(
    IPC.chatSend,
    async (
      event,
      input: { conversationId: string; content: string; quotes?: QuoteInput[] }
    ) => {
      return chatService.send({
        conversationId: input.conversationId,
        content: input.content,
        quotes: input.quotes,
        profile: resolveActiveProfile(),
        events: chatEvents(event.sender)
      })
    }
  )

  ipcMain.handle(
    IPC.chatRegenerate,
    async (event, input: { conversationId: string; turnIndex: number }) => {
      return chatService.regenerate({
        conversationId: input.conversationId,
        turnIndex: input.turnIndex,
        profile: resolveActiveProfile(),
        events: chatEvents(event.sender)
      })
    }
  )

  ipcMain.handle(IPC.chatCancel, (_event, input: { requestId: string }) => {
    chatService.cancel(input.requestId)
  })
}
