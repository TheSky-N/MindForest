import type {
  ChatDeltaEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  ChatSendResult,
  Message,
  QuoteInput
} from '@shared/types'
import type { AppDatabase } from '../db/client'
import { createCardRepository } from '../db/repositories/cards'
import { createConversationRepository } from '../db/repositories/conversations'
import { createMessageRepository } from '../db/repositories/messages'
import { createQuoteRepository } from '../db/repositories/quotes'
import { newId } from '../db/ids'
import { assembleCardContext, type AssembledCardContext } from '../llm/contextAssembler'
import { streamChatCompletion, type StreamChatCompletionFn } from '../llm/client'

export interface RuntimeProfile {
  baseUrl: string
  model: string
  temperature: number
  apiKey?: string
}

export interface ChatEventSink {
  delta(event: ChatDeltaEvent): void
  done(event: ChatDoneEvent): void
  error(event: ChatErrorEvent): void
}

export interface ChatService {
  send(input: {
    conversationId: string
    content: string
    quotes?: QuoteInput[]
    profile: RuntimeProfile
    events: ChatEventSink
  }): Promise<ChatSendResult>
  regenerate(input: {
    conversationId: string
    turnIndex: number
    profile: RuntimeProfile
    events: ChatEventSink
  }): Promise<ChatSendResult>
  cancel(requestId: string): void
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const DELTA_BATCH_MS = 30

export function createChatService(options: {
  db: AppDatabase
  streamFn?: StreamChatCompletionFn
  onTurnSettled?: (cardId: string) => void
}): ChatService {
  const { db } = options
  const streamFn = options.streamFn ?? streamChatCompletion
  const controllers = new Map<string, AbortController>()

  const notifySettled = (cardId: string) => {
    try {
      options.onTurnSettled?.(cardId)
    } catch {
      void 0
    }
  }

  function startAssistantStream(input: {
    conversationId: string
    turnIndex: number
    profile: RuntimeProfile
    context: AssembledCardContext
    events: ChatEventSink
  }): { requestId: string; assistantMessage: Message } {
    const messagesRepo = createMessageRepository(db)
    const conversationsRepo = createConversationRepository(db)
    const cardsRepo = createCardRepository(db)

    const conversation = conversationsRepo.getById(input.conversationId)
    if (!conversation) throw new Error('对话不存在')

    const assistantMessage = messagesRepo.createAssistant({
      conversationId: conversation.id,
      turnIndex: input.turnIndex,
      model: input.profile.model
    })

    const requestId = newId()
    const controller = new AbortController()
    controllers.set(requestId, controller)

    const { events } = input
    let buffer = ''
    let pending = ''
    let deltaTimer: ReturnType<typeof setTimeout> | null = null

    const flushDeltas = () => {
      if (deltaTimer) {
        clearTimeout(deltaTimer)
        deltaTimer = null
      }
      if (!pending) return
      const delta = pending
      pending = ''
      events.delta({ requestId, messageId: assistantMessage.id, delta })
    }

    void (async () => {
      try {
        const content = await streamFn({
          baseUrl: input.profile.baseUrl,
          apiKey: input.profile.apiKey,
          model: input.profile.model,
          temperature: input.profile.temperature,
          messages: [
            { role: 'system', content: input.context.system },
            ...input.context.chatMessages
          ],
          signal: controller.signal,
          onDelta: (delta) => {
            buffer += delta
            pending += delta
            if (deltaTimer === null) {
              deltaTimer = setTimeout(flushDeltas, DELTA_BATCH_MS)
            }
          }
        })
        flushDeltas()
        const updated = messagesRepo.completeAssistant(
          assistantMessage.id,
          content,
          input.profile.model
        )
        conversationsRepo.touch(conversation.id)
        cardsRepo.touch(conversation.cardId)
        events.done({ requestId, message: updated })
        notifySettled(conversation.cardId)
      } catch (error) {
        flushDeltas()
        if (controller.signal.aborted || isAbortError(error)) {
          const updated = messagesRepo.abortAssistant(assistantMessage.id, buffer)
          events.error({ requestId, message: updated })
        } else {
          const updated = messagesRepo.failAssistant(
            assistantMessage.id,
            errorMessage(error),
            buffer
          )
          events.error({ requestId, message: updated })
        }
        conversationsRepo.touch(conversation.id)
        notifySettled(conversation.cardId)
      } finally {
        if (deltaTimer) {
          clearTimeout(deltaTimer)
          deltaTimer = null
        }
        controllers.delete(requestId)
      }
    })()

    return { requestId, assistantMessage }
  }

  return {
    async send(input) {
      const conversationsRepo = createConversationRepository(db)
      const messagesRepo = createMessageRepository(db)
      const quotesRepo = createQuoteRepository(db)

      const conversation = conversationsRepo.getById(input.conversationId)
      if (!conversation) throw new Error('对话不存在')

      const userMessage = messagesRepo.appendUser({
        conversationId: conversation.id,
        content: input.content
      })
      if (input.quotes && input.quotes.length > 0) {
        quotesRepo.createMany(userMessage.id, input.quotes)
      }

      const context = assembleCardContext(db, conversation.cardId)
      const started = startAssistantStream({
        conversationId: conversation.id,
        turnIndex: userMessage.turnIndex,
        profile: input.profile,
        context,
        events: input.events
      })

      return {
        requestId: started.requestId,
        userMessage,
        assistantMessage: started.assistantMessage
      }
    },

    async regenerate(input) {
      const conversationsRepo = createConversationRepository(db)
      const messagesRepo = createMessageRepository(db)

      const conversation = conversationsRepo.getById(input.conversationId)
      if (!conversation) throw new Error('对话不存在')

      const userMessage = messagesRepo
        .listTurnMessages(conversation.id, input.turnIndex)
        .find((message) => message.role === 'user')
      if (!userMessage) throw new Error('找不到该轮的用户消息')

      const context = assembleCardContext(db, conversation.cardId, {
        uptoTurnIndex: input.turnIndex,
        excludeAssistantTurnIndex: input.turnIndex
      })
      const started = startAssistantStream({
        conversationId: conversation.id,
        turnIndex: input.turnIndex,
        profile: input.profile,
        context,
        events: input.events
      })

      return {
        requestId: started.requestId,
        userMessage,
        assistantMessage: started.assistantMessage
      }
    },

    cancel(requestId) {
      controllers.get(requestId)?.abort()
    }
  }
}
