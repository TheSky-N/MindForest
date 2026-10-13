import type { AppDatabase } from '../db/client'
import { createDigestRepository } from '../db/repositories/digests'
import { createNodeRepository } from '../db/repositories/nodes'
import { completeChat } from './client'
import {
  DIGEST_RECENT_WINDOW_TURNS,
  DIGEST_SOURCE_TOKEN_BUDGET,
  DIGEST_TRIGGER_TOKENS,
  DIGEST_TRIGGER_TURNS
} from './contextAssembler'
import { countTokens } from './tokens'

const CHAIN_DIGEST_SYSTEM_PROMPT = [
  '你是一个对话压缩助手。',
  '请把给定的一段早期对话压缩成背景摘要，供后续对话作为已发生的历史使用：',
  '- 使用简体中文；',
  '- 保留关键背景、术语约定、结论、未决问题与用户偏好；',
  '- 200-400 字，不要使用 Markdown 标题，直接输出摘要正文。'
].join('\n')

export type DigestOutcome = 'skipped' | 'updated' | 'failed'

export async function refreshChainDigest(options: {
  db: AppDatabase
  nodeId: string
  profile: { baseUrl: string; model: string; temperature: number; apiKey?: string }
  completeFn?: typeof completeChat
}): Promise<DigestOutcome> {
  const { db, nodeId, profile } = options
  const complete = options.completeFn ?? completeChat
  const nodeRepo = createNodeRepository(db)
  const digestRepo = createDigestRepository(db)

  let path
  try {
    path = nodeRepo.getPath(nodeId)
  } catch {
    return 'skipped'
  }
  if (path.length <= DIGEST_RECENT_WINDOW_TURNS) return 'skipped'

  const boundaryIndex = path.length - 1 - DIGEST_RECENT_WINDOW_TURNS
  const boundary = path[boundaryIndex]
  if (!boundary) return 'skipped'
  if (digestRepo.get(boundary.id)) return 'skipped'

  const covered = path.slice(0, boundaryIndex + 1)
  let coveredTokens = 0
  for (const node of covered) {
    coveredTokens += countTokens(node.userContent)
    if (node.assistantContent.trim()) coveredTokens += countTokens(node.assistantContent)
  }
  if (covered.length < DIGEST_TRIGGER_TURNS && coveredTokens < DIGEST_TRIGGER_TOKENS) {
    return 'skipped'
  }

  const picked: string[] = []
  let used = 0
  for (const node of covered) {
    const block = `用户：${node.userContent.trim()}${node.assistantContent.trim() ? `\nAI：${node.assistantContent.trim()}` : ''}`
    const cost = countTokens(block)
    if (used + cost > DIGEST_SOURCE_TOKEN_BUDGET) break
    used += cost
    picked.push(block)
  }
  if (picked.length === 0) return 'skipped'

  try {
    const raw = await complete({
      baseUrl: profile.baseUrl,
      model: profile.model,
      temperature: 0.3,
      apiKey: profile.apiKey,
      messages: [
        { role: 'system', content: CHAIN_DIGEST_SYSTEM_PROMPT },
        { role: 'user', content: `早期对话（共 ${covered.length} 轮）：\n\n${picked.join('\n\n')}` }
      ],
      maxTokens: 700
    })
    const digest = raw.trim()
    if (!digest) return 'failed'
    digestRepo.upsert({
      boundaryNodeId: boundary.id,
      digest,
      coveredNodeCount: covered.length,
      coveredTokenCount: coveredTokens
    })
    return 'updated'
  } catch {
    return 'failed'
  }
}
