import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import { projects } from '../db/schema'
import { createDigestRepository } from '../db/repositories/digests'
import { createNodeRepository } from '../db/repositories/nodes'
import { createQuoteRepository } from '../db/repositories/quotes'
import type { ChatMessage } from './client'
import { countTokens } from './tokens'

export const CONTEXT_TOKEN_BUDGET = 12000
export const DIGEST_RECENT_WINDOW_TURNS = 6
export const DIGEST_TRIGGER_TURNS = 12
export const DIGEST_TRIGGER_TOKENS = 6000
export const DIGEST_SOURCE_TOKEN_BUDGET = 6000

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

export function pathTokenStats(
  db: AppDatabase,
  nodeId: string
): { turns: number; tokens: number } {
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
  options: { budget?: number } = {}
): AssembledNodeContext {
  const budget = options.budget ?? CONTEXT_TOKEN_BUDGET
  const nodeRepo = createNodeRepository(db)
  const digestRepo = createDigestRepository(db)
  const quoteRepo = createQuoteRepository(db)

  const path = nodeRepo.getPath(nodeId)
  if (path.length === 0) throw new Error('节点不存在')
  const projectRow = db.select().from(projects).where(eq(projects.id, path[0]!.projectId)).get()

  const ancestorIds = path.slice(0, -1).map((node) => node.id)
  const digest = digestRepo.findDeepestInPath(ancestorIds)
  const boundaryIndex = digest
    ? path.findIndex((node) => node.id === digest.boundaryNodeId)
    : -1
  const turns = path.slice(boundaryIndex + 1)

  const quoteRows = quoteRepo.listByNodes(turns.map((turn) => turn.id))
  const quotesByNode = new Map<string, string[]>()
  for (const quote of quoteRows) {
    const list = quotesByNode.get(quote.nodeId) ?? []
    list.push(quote.quoteText)
    quotesByNode.set(quote.nodeId, list)
  }

  const messages: ChatMessage[] = []
  for (const turn of turns) {
    const quotes = quotesByNode.get(turn.id)
    const userContent =
      quotes && quotes.length > 0
        ? `${quotes.map((quote) => `【用户引用的内容】${quote}`).join('\n')}\n\n${turn.userContent}`
        : turn.userContent
    messages.push({ role: 'user', content: userContent })
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

  const tokenOf = (message: ChatMessage) => countTokens(message.content)
  let total = countTokens(system) + messages.reduce((sum, message) => sum + tokenOf(message), 0)
  let start = 0
  let truncated = false
  while (total > budget && start < messages.length - 1) {
    total -= tokenOf(messages[start])
    start += 1
    truncated = true
  }
  let trimmed = messages.slice(start)
  if (trimmed.length === 0) trimmed = messages.slice(-1)

  return {
    system,
    messages: trimmed,
    estimatedTokens: countTokens(system) + trimmed.reduce((sum, message) => sum + tokenOf(message), 0),
    truncated,
    digestBoundaryNodeId: digest?.boundaryNodeId ?? null
  }
}
