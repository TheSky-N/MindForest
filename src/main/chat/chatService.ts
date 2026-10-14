import type {
  ChatDeltaEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  ChatSendResult,
  QuoteInput,
  TurnNode
} from '@shared/types'
import type { AppDatabase } from '../db/client'
import { createNodeRepository } from '../db/repositories/nodes'
import { createProjectRepository } from '../db/repositories/projects'
import { createQuoteRepository } from '../db/repositories/quotes'
import { newId } from '../db/ids'
import { assembleNodeContext } from '../llm/contextAssembler'
import { streamChatCompletion, type StreamChatCompletionFn } from '../llm/client'
import { countTokens } from '../llm/tokens'

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
    projectId: string
    parentId: string | null
    content: string
    quotes?: QuoteInput[]
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
}): ChatService {
  const { db } = options
  const streamFn = options.streamFn ?? streamChatCompletion
  const controllers = new Map<string, AbortController>()

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
    const context = assembleNodeContext(db, input.node.id)

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
      events.delta({ requestId, nodeId: input.node.id, delta })
    }

    void (async () => {
      try {
        const result = await streamFn({
          baseUrl: input.profile.baseUrl,
          apiKey: input.profile.apiKey,
          model: input.profile.model,
          temperature: input.profile.temperature,
          messages: [{ role: 'system', content: context.system }, ...context.messages],
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
        const usage = result.usage ?? {
          promptTokens: context.estimatedTokens,
          completionTokens: countTokens(result.content)
        }
        const updated = nodeRepo.completeAssistant(
          input.node.id,
          result.content,
          input.profile.model,
          usage
        )
        projectRepo.touch(input.node.projectId)
        events.done({ requestId, node: updated })
      } catch (error) {
        flushDeltas()
        const partialUsage = buffer
          ? {
              promptTokens: context.estimatedTokens,
              completionTokens: countTokens(buffer)
            }
          : undefined
        if (controller.signal.aborted || isAbortError(error)) {
          const updated = nodeRepo.abortAssistant(input.node.id, buffer, partialUsage)
          events.error({ requestId, node: updated })
        } else {
          const updated = nodeRepo.failAssistant(
            input.node.id,
            errorMessage(error),
            buffer,
            partialUsage
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

      const node = nodeRepo.create({
        projectId: project.id,
        parentId: input.parentId,
        userContent: content,
        model: input.profile.model
      })
      if (input.quotes && input.quotes.length > 0) {
        createQuoteRepository(db).createMany(node.id, input.quotes)
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
      const requestId = startNodeStream({ node, profile: input.profile, events: input.events })
      return { requestId, node }
    },

    cancel(requestId) {
      controllers.get(requestId)?.abort()
    }
  }
}
