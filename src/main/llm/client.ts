import type { TokenUsage } from '@shared/types'
import { iterateSseData } from './sse'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamChatResult {
  content: string
  usage: TokenUsage | null
}

export interface StreamChatOptions {
  baseUrl: string
  apiKey?: string
  model: string
  temperature?: number
  messages: ChatMessage[]
  signal?: AbortSignal
  onDelta?: (delta: string) => void
}

export type StreamChatCompletionFn = (options: StreamChatOptions) => Promise<StreamChatResult>

export function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error('模型 Base URL 不能为空')
  if (trimmed.endsWith('/chat/completions')) return trimmed
  return `${trimmed}/chat/completions`
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

async function ensureOk(response: Response): Promise<void> {
  if (response.ok) return
  const body = await response.text().catch(() => '')
  throw new Error(`模型接口返回 ${response.status}${body ? `：${body.slice(0, 300)}` : ''}`)
}

function extractDelta(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const delta = (choices[0] as { delta?: unknown }).delta
  if (typeof delta !== 'object' || delta === null) return null
  const content = (delta as { content?: unknown }).content
  return typeof content === 'string' ? content : null
}

function extractMessageContent(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const message = (choices[0] as { message?: unknown }).message
  if (typeof message !== 'object' || message === null) return null
  const content = (message as { content?: unknown }).content
  return typeof content === 'string' ? content : null
}

function toCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function extractUsage(payload: unknown): TokenUsage | null {
  if (typeof payload !== 'object' || payload === null) return null
  const usage = (payload as { usage?: unknown }).usage
  if (typeof usage !== 'object' || usage === null) return null
  const record = usage as Record<string, unknown>
  const promptTokens = toCount(record.prompt_tokens ?? record.prompt_eval_count)
  const completionTokens = toCount(record.completion_tokens ?? record.eval_count)
  if (promptTokens === null || completionTokens === null) return null
  return { promptTokens, completionTokens }
}

const streamOptionsRetryPattern = /stream_options|include_usage/i

export const streamChatCompletion: StreamChatCompletionFn = async (options) => {
  const requestBody = (includeUsage: boolean): string =>
    JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
      stream: true,
      ...(includeUsage ? { stream_options: { include_usage: true } } : {})
    })

  const send = (includeUsage: boolean): Promise<Response> =>
    fetch(buildChatCompletionsUrl(options.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(options.apiKey) },
      body: requestBody(includeUsage),
      signal: options.signal
    })

  let response = await send(true)
  if (!response.ok && (response.status === 400 || response.status === 422)) {
    const body = await response.text().catch(() => '')
    if (!streamOptionsRetryPattern.test(body)) {
      throw new Error(`模型接口返回 ${response.status}${body ? `：${body.slice(0, 300)}` : ''}`)
    }
    response = await send(false)
  }
  await ensureOk(response)
  if (!response.body) throw new Error('模型接口没有返回流式内容')

  let full = ''
  let usage: TokenUsage | null = null
  for await (const data of iterateSseData(response.body)) {
    if (data === '[DONE]') break
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      continue
    }
    const chunkUsage = extractUsage(payload)
    if (chunkUsage) usage = chunkUsage
    const delta = extractDelta(payload)
    if (delta) {
      full += delta
      options.onDelta?.(delta)
    }
  }
  return { content: full, usage }
}

export async function completeChat(
  options: Omit<StreamChatOptions, 'onDelta' | 'signal'> & {
    signal?: AbortSignal
    maxTokens?: number
  }
): Promise<string> {
  const response = await fetch(buildChatCompletionsUrl(options.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(options.apiKey) },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
      stream: false,
      max_tokens: options.maxTokens
    }),
    signal: options.signal
  })
  await ensureOk(response)
  const payload = (await response.json()) as unknown
  const content = extractMessageContent(payload)
  if (content === null) throw new Error('模型接口返回了无法解析的内容')
  return content
}
