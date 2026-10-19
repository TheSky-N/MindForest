import type {
  ChatAttachmentInput,
  ChatDeltaEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  ChatSendResult,
  LlmCapabilities,
  LlmProviderId,
  QuoteInput,
  ReasoningEffort,
  TurnNode
} from '@shared/types'
import { DEFAULT_LLM_CAPABILITIES } from '@shared/types'
import type { AppDatabase } from '../db/client'
import { createAttachmentRepository } from '../db/repositories/attachments'
import { createNodeRepository } from '../db/repositories/nodes'
import { createProjectRepository } from '../db/repositories/projects'
import { createQuoteRepository } from '../db/repositories/quotes'
import { newId } from '../db/ids'
import { saveChatAttachments } from '../attachments/storage'
import { assembleNodeContext } from '../llm/contextAssembler'
import { streamChatCompletion, type StreamChatCompletionFn } from '../llm/client'
import { countTokens } from '../llm/tokens'

export interface RuntimeProfile {
  provider?: LlmProviderId
  baseUrl: string
  model: string
  temperature: number
  capabilities?: LlmCapabilities
  reasoningEffort?: ReasoningEffort | null
  apiKey?: string
}

export interface ChatEventSink {
  delta(event: ChatDeltaEvent): void
  done(event: ChatDoneEvent): void
  error(event: ChatErrorEvent): void
}

export interface ChatService {
  send(input: {
    projectId: string
    parentId: string | null
    content: string
    quotes?: QuoteInput[]
    attachments?: ChatAttachmentInput[]
    profile: RuntimeProfile
    events: ChatEventSink
  }): Promise<ChatSendResult>
  regenerate(input: {
    nodeId: string
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
  onTurnSettled?: (nodeId: string) => void
  attachmentsRoot?: string
}): ChatService {
  const { db } = options
  const streamFn = options.streamFn ?? streamChatCompletion
  const controllers = new Map<string, AbortController>()
  const attachments = createAttachmentRepository(db)
  const capabilities = (profile: RuntimeProfile): LlmCapabilities =>
    profile.capabilities ?? DEFAULT_LLM_CAPABILITIES

  const notifySettled = (nodeId: string) => {
    try {
      options.onTurnSettled?.(nodeId)
    } catch {
      void 0
    }
  }

  function startNodeStream(input: {
    node: TurnNode
    profile: RuntimeProfile
    events: ChatEventSink
  }): string {
    const nodeRepo = createNodeRepository(db)
    const projectRepo = createProjectRepository(db)
    const profileCapabilities = capabilities(input.profile)
    const contextBudget = input.profile.capabilities
      ? Math.min(Math.max(Math.floor(input.profile.capabilities.contextWindow * 0.2), 4000), 24000)
      : undefined
    const context = assembleNodeContext(db, input.node.id, {
      budget: contextBudget,
      vision: profileCapabilities.vision,
      attachmentsRoot: options.attachmentsRoot
    })

    const requestId = newId()
    const controller = new AbortController()
    controllers.set(requestId, controller)

    const { events } = input
    let buffer = ''
    let reasoningBuffer = ''
    let pending = ''
    let pendingReasoning = ''
    let deltaTimer: ReturnType<typeof setTimeout> | null = null

    const flushDeltas = () => {
      if (deltaTimer) {
        clearTimeout(deltaTimer)
        deltaTimer = null
      }
      if (!pending && !pendingReasoning) return
      const delta = pending
      const reasoningDelta = pendingReasoning
      pending = ''
      pendingReasoning = ''
      events.delta({
        requestId,
        nodeId: input.node.id,
        delta,
        ...(reasoningDelta ? { reasoningDelta } : {})
      })
    }

    const scheduleFlush = () => {
      if (deltaTimer === null) deltaTimer = setTimeout(flushDeltas, DELTA_BATCH_MS)
    }

    void (async () => {
      try {
        const result = await streamFn({
          provider: input.profile.provider,
          baseUrl: input.profile.baseUrl,
          apiKey: input.profile.apiKey,
          model: input.profile.model,
          temperature: input.profile.temperature,
          reasoningEffort: input.profile.reasoningEffort,
          messages: [{ role: 'system', content: context.system }, ...context.messages],
          signal: controller.signal,
          onDelta: (delta) => {
            buffer += delta
            pending += delta
            scheduleFlush()
          },
          onReasoningDelta: (delta) => {
            reasoningBuffer += delta
            pendingReasoning += delta
            scheduleFlush()
          }
        })
        flushDeltas()
        const usage = result.usage ?? {
          promptTokens: context.estimatedTokens,
          completionTokens: countTokens(result.content) + countTokens(result.reasoning ?? '')
        }
        const updated = nodeRepo.completeAssistant(
          input.node.id,
          result.content,
          input.profile.model,
          usage,
          result.reasoning ?? ''
        )
        projectRepo.touch(input.node.projectId)
        events.done({ requestId, node: updated })
      } catch (error) {
        flushDeltas()
        const partialUsage =
          buffer || reasoningBuffer
            ? {
                promptTokens: context.estimatedTokens,
                completionTokens: countTokens(buffer) + countTokens(reasoningBuffer)
              }
            : undefined
        if (controller.signal.aborted || isAbortError(error)) {
          const updated = nodeRepo.abortAssistant(
            input.node.id,
            buffer,
            partialUsage,
            reasoningBuffer
          )
          events.error({ requestId, node: updated })
        } else {
          const updated = nodeRepo.failAssistant(
            input.node.id,
            errorMessage(error),
            buffer,
            partialUsage,
            reasoningBuffer
          )
          events.error({ requestId, node: updated })
        }
        projectRepo.touch(input.node.projectId)
      } finally {
        if (deltaTimer) {
          clearTimeout(deltaTimer)
          deltaTimer = null
        }
        controllers.delete(requestId)
        notifySettled(input.node.id)
      }
    })()

    return requestId
  }

  return {
    async send(input) {
      const content = input.content.trim()
      if (!content) throw new Error('消息内容不能为空')
      const projects = createProjectRepository(db)
      const project = projects.get(input.projectId)
      if (!project) throw new Error('项目不存在')
      const nodeRepo = createNodeRepository(db)
      if (input.parentId) {
        const parent = nodeRepo.getOrThrow(input.parentId)
        if (parent.projectId !== project.id) throw new Error('父节点不属于该项目')
      }

      if (input.attachments && input.attachments.length > 0 && !options.attachmentsRoot) {
        throw new Error('附件目录尚未配置')
      }

      const node = nodeRepo.create({
        projectId: project.id,
        parentId: input.parentId,
        userContent: content,
        model: input.profile.model
      })
      if (input.quotes && input.quotes.length > 0) {
        createQuoteRepository(db).createMany(node.id, input.quotes)
      }
      try {
        if (input.attachments && input.attachments.length > 0) {
          const stored = saveChatAttachments(options.attachmentsRoot!, node.id, input.attachments)
          attachments.createMany(node.id, stored)
        }
      } catch (error) {
        nodeRepo.failAssistant(node.id, errorMessage(error))
        throw error
      }
      projects.touch(project.id)
      const requestId = startNodeStream({ node, profile: input.profile, events: input.events })
      return { requestId, node }
    },

    async regenerate(input) {
      const nodeRepo = createNodeRepository(db)
      const source = nodeRepo.getOrThrow(input.nodeId)
      let groupId = source.turnGroupId
      if (!groupId) {
        groupId = newId()
        nodeRepo.setTurnGroup(source.id, groupId)
      }
      const node = nodeRepo.create({
        projectId: source.projectId,
        parentId: source.parentId,
        userContent: source.userContent,
        model: input.profile.model,
        turnGroupId: groupId,
        isMainBranch: false
      })
      const sourceQuotes = createQuoteRepository(db).listByNode(source.id)
      if (sourceQuotes.length > 0) {
        createQuoteRepository(db).createMany(
          node.id,
          sourceQuotes.map((quote) => ({
            quotedNodeId: quote.quotedNodeId,
            quoteText: quote.quoteText
          }))
        )
      }
      attachments.copyToNode(source.id, node.id)
      const requestId = startNodeStream({ node, profile: input.profile, events: input.events })
      return { requestId, node }
    },

    cancel(requestId) {
      controllers.get(requestId)?.abort()
    }
  }
}
