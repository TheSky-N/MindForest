import { iterateSseData } from './sse'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
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

export type StreamChatCompletionFn = (options: StreamChatOptions) => Promise<string>

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

export const streamChatCompletion: StreamChatCompletionFn = async (options) => {
  const response = await fetch(buildChatCompletionsUrl(options.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(options.apiKey) },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
      stream: true
    }),
    signal: options.signal
  })
  await ensureOk(response)
  if (!response.body) throw new Error('模型接口没有返回流式内容')

  let full = ''
  for await (const data of iterateSseData(response.body)) {
    if (data === '[DONE]') break
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      continue
    }
    const delta = extractDelta(payload)
    if (delta) {
      full += delta
      options.onDelta?.(delta)
    }
  }
  return full
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
