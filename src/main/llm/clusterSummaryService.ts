import type { TopicCluster } from '@shared/types'
import type { AppDatabase } from '../db/client'
import { createClusterRepository } from '../db/repositories/clusters'
import { createNodeRepository } from '../db/repositories/nodes'
import { completeChat } from './client'
import { DIGEST_SOURCE_TOKEN_BUDGET } from './contextAssembler'
import { orderClusterMembers } from '../topics/clusterService'
import { countTokens } from './tokens'

const CLUSTER_SUMMARY_SYSTEM_PROMPT = [
  '你是一个主题整理助手。',
  '请为给定的对话片段生成主题标题与摘要：',
  '- 第一行只输出标题：以「标题：」开头，6-20 个简体中文字，不要引号；',
  '- 空一行后输出「摘要：」，用 100-300 字概括这段对话讨论的内容、结论与未决问题；',
  '- 不要输出其他内容。'
].join('\n')

export function sanitizeTitle(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/^[#\s"'“”‘’《》「」【】]+/, '')
    .replace(/["'“”‘’《》。，,.\s」】]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
}

export function parseClusterSummary(raw: string): { title: string; summary: string } {
  const titleMatch = /标题[:：]\s*(.+)/.exec(raw)
  const summaryMatch = /摘要[:：]\s*([\s\S]+)/.exec(raw)
  if (titleMatch || summaryMatch) {
    return {
      title: titleMatch ? sanitizeTitle(titleMatch[1] ?? '') : '',
      summary: summaryMatch ? (summaryMatch[1] ?? '').trim() : ''
    }
  }
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const title = sanitizeTitle(lines[0] ?? '')
  const summary = lines.slice(1).join(' ').trim()
  return { title, summary }
}

export async function generateClusterSummary(options: {
  db: AppDatabase
  clusterId: string
  profile: { baseUrl: string; model: string; temperature: number; apiKey?: string }
  completeFn?: typeof completeChat
}): Promise<TopicCluster | null> {
  const { db, clusterId, profile } = options
  const complete = options.completeFn ?? completeChat
  const clusters = createClusterRepository(db)
  const nodeRepo = createNodeRepository(db)

  const cluster = clusters.getWithMembers(clusterId)
  if (!cluster || cluster.nodeIds.length === 0) return null

  const ordered = orderClusterMembers(db, cluster.projectId, cluster.nodeIds)
  const byId = new Map(
    nodeRepo
      .listByIds(ordered)
      .filter((node) => !node.deletedAt)
      .map((node) => [node.id, node])
  )
  const picked: string[] = []
  let used = 0
  for (const id of ordered) {
    const node = byId.get(id)
    if (!node) continue
    const block = `用户：${node.userContent.trim()}${node.assistantContent.trim() ? `\nAI：${node.assistantContent.trim()}` : ''}`
    const cost = countTokens(block)
    if (used + cost > DIGEST_SOURCE_TOKEN_BUDGET) break
    used += cost
    picked.push(block)
  }
  if (picked.length === 0) return null

  const raw = await complete({
    baseUrl: profile.baseUrl,
    model: profile.model,
    temperature: 0.3,
    apiKey: profile.apiKey,
    messages: [
      { role: 'system', content: CLUSTER_SUMMARY_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `主题共包含 ${ordered.length} 轮对话：\n\n${picked.join('\n\n')}`
      }
    ],
    maxTokens: 600
  })

  const { title, summary } = parseClusterSummary(raw)
  if (!title && !summary) return null
  return clusters.setGenerated(clusterId, {
    title: title || cluster.title,
    summary: summary || cluster.summary || ''
  })
}
