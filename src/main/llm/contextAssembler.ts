import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import { projects } from '../db/schema'
import { createAttachmentRepository } from '../db/repositories/attachments'
import { createDigestRepository } from '../db/repositories/digests'
import { createNodeRepository } from '../db/repositories/nodes'
import { createQuoteRepository } from '../db/repositories/quotes'
import { readImageDataUrl } from '../attachments/storage'
import type { ChatContentPart, ChatMessage } from './client'
import { countTokens } from './tokens'

export const CONTEXT_TOKEN_BUDGET = 12000
export const DIGEST_RECENT_WINDOW_TURNS = 6
export const DIGEST_TRIGGER_TURNS = 12
export const DIGEST_TRIGGER_TOKENS = 6000
export const DIGEST_SOURCE_TOKEN_BUDGET = 6000
export const IMAGE_TOKEN_ESTIMATE = 1100

const BASE_SYSTEM_PROMPT = [
  '你是 MindForest 中的 AI 学习伙伴，帮助用户深入理解与探索各类主题。',
  '要求：',
  '- 使用简体中文回答；',
  '- 使用 Markdown 组织内容，数学公式使用 $...$ 或 $$...$$；',
  '- 回答准确、清晰、不啰嗦，必要时给出例子。'
].join('\n')

export interface AssembledNodeContext {
  system: string
  messages: ChatMessage[]
  estimatedTokens: number
  truncated: boolean
  digestBoundaryNodeId: string | null
}

export interface AssembleNodeContextOptions {
  budget?: number
  vision?: boolean
  attachmentsRoot?: string
}

export function messageTokenCost(message: ChatMessage): number {
  if (typeof message.content === 'string') return countTokens(message.content)
  return message.content.reduce(
    (sum, part) => sum + (part.type === 'text' ? countTokens(part.text) : IMAGE_TOKEN_ESTIMATE),
    0
  )
}

export function pathTokenStats(db: AppDatabase, nodeId: string): { turns: number; tokens: number } {
  const path = createNodeRepository(db).getPath(nodeId)
  let tokens = 0
  for (const node of path) {
    tokens += countTokens(node.userContent)
    if (node.assistantContent.trim()) tokens += countTokens(node.assistantContent)
  }
  return { turns: path.length, tokens }
}

export function assembleNodeContext(
  db: AppDatabase,
  nodeId: string,
  options: AssembleNodeContextOptions = {}
): AssembledNodeContext {
  const budget = options.budget ?? CONTEXT_TOKEN_BUDGET
  const nodeRepo = createNodeRepository(db)
  const digestRepo = createDigestRepository(db)
  const quoteRepo = createQuoteRepository(db)
  const attachmentRepo = createAttachmentRepository(db)

  const path = nodeRepo.getPath(nodeId)
  if (path.length === 0) throw new Error('节点不存在')
  const projectRow = db.select().from(projects).where(eq(projects.id, path[0]!.projectId)).get()

  const ancestorIds = path.slice(0, -1).map((node) => node.id)
  const digest = digestRepo.findDeepestInPath(ancestorIds)
  const boundaryIndex = digest ? path.findIndex((node) => node.id === digest.boundaryNodeId) : -1
  const turns = path.slice(boundaryIndex + 1)

  const quoteRows = quoteRepo.listByNodes(turns.map((turn) => turn.id))
  const quotesByNode = new Map<string, string[]>()
  for (const quote of quoteRows) {
    const list = quotesByNode.get(quote.nodeId) ?? []
    list.push(quote.quoteText)
    quotesByNode.set(quote.nodeId, list)
  }

  const attachmentRows = attachmentRepo.listTextByNodes(turns.map((turn) => turn.id))
  const attachmentsByNode = new Map<string, typeof attachmentRows>()
  for (const attachment of attachmentRows) {
    const list = attachmentsByNode.get(attachment.nodeId) ?? []
    list.push(attachment)
    attachmentsByNode.set(attachment.nodeId, list)
  }

  const messages: ChatMessage[] = []
  for (const turn of turns) {
    const quotes = quotesByNode.get(turn.id)
    let userText =
      quotes && quotes.length > 0
        ? `${quotes.map((quote) => `【用户引用的内容】${quote}`).join('\n')}\n\n${turn.userContent}`
        : turn.userContent

    const imageParts: ChatContentPart[] = []
    for (const attachment of attachmentsByNode.get(turn.id) ?? []) {
      if (attachment.kind === 'image') {
        if (options.vision && options.attachmentsRoot) {
          const url = readImageDataUrl(
            options.attachmentsRoot,
            attachment.storagePath,
            attachment.mimeType
          )
          if (url) imageParts.push({ type: 'image_url', image_url: { url } })
        }
        continue
      }
      const text = attachment.textContent?.trim()
      if (text) {
        userText += `\n\n【附件：${attachment.name}】\n${text}`
      }
    }

    const content: string | ChatContentPart[] =
      imageParts.length > 0 ? [{ type: 'text', text: userText }, ...imageParts] : userText
    messages.push({ role: 'user', content })

    const isTarget = turn.id === nodeId
    if (!isTarget && turn.assistantStatus !== 'streaming' && turn.assistantContent.trim()) {
      messages.push({ role: 'assistant', content: turn.assistantContent })
    }
  }

  const systemParts = [BASE_SYSTEM_PROMPT]
  if (projectRow) systemParts.push(`【项目】${projectRow.name}`)
  if (digest) {
    systemParts.push(
      `【早期对话摘要】以下是你与用户此前对话的压缩摘要，请把它当作已经发生的上下文：\n${digest.digest}`
    )
  }
  const system = systemParts.join('\n\n')

  let total =
    countTokens(system) + messages.reduce((sum, message) => sum + messageTokenCost(message), 0)
  let start = 0
  let truncated = false
  while (total > budget && start < messages.length - 1) {
    total -= messageTokenCost(messages[start]!)
    start += 1
    truncated = true
  }
  let trimmed = messages.slice(start)
  if (trimmed.length === 0) trimmed = messages.slice(-1)

  return {
    system,
    messages: trimmed,
    estimatedTokens:
      countTokens(system) + trimmed.reduce((sum, message) => sum + messageTokenCost(message), 0),
    truncated,
    digestBoundaryNodeId: digest?.boundaryNodeId ?? null
  }
}
