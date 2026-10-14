import type { AppDatabase } from '../db/client'
import { createNodeRepository } from '../db/repositories/nodes'
import { completeChat } from '../llm/client'
import type { RuntimeProfile } from './chatService'

export const MAX_NODE_TITLE_LENGTH = 24

export function sanitizeNodeTitle(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^(标题|题目|主题|title)\s*[:：]\s*/i, '')
    .replace(/^[#>*\-\s"'“”‘’]+/, '')
    .replace(/["'“”‘’]/g, '')
    .trim()
    .replace(/[。．.!！?？,，;；:：]+$/, '')
    .trim()
    .slice(0, MAX_NODE_TITLE_LENGTH)
}

type CompleteFn = (options: Parameters<typeof completeChat>[0]) => Promise<string>

export async function generateNodeTitle(options: {
  db: AppDatabase
  nodeId: string
  profile: RuntimeProfile
  completeFn?: CompleteFn
}): Promise<string> {
  const node = createNodeRepository(options.db).getOrThrow(options.nodeId)
  const completeFn = options.completeFn ?? completeChat
  const prompt = [
    '你是 MindForest 的标题助手。请根据下面这一轮对话生成一个简洁的中文标题。',
    '要求：不超过 16 个字；只输出标题本身；不要结尾标点；不要引号或任何前缀。',
    '',
    `用户：${node.userContent.slice(0, 500)}`,
    node.assistantContent.trim() ? `助手：${node.assistantContent.slice(0, 800)}` : ''
  ]
    .filter((line) => line.length > 0)
    .join('\n')
  const raw = await completeFn({
    baseUrl: options.profile.baseUrl,
    apiKey: options.profile.apiKey,
    model: options.profile.model,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 64
  })
  const title = sanitizeNodeTitle(raw)
  if (!title) throw new Error('模型未返回有效标题')
  return title
}
