import type { LlmProviderId, ReasoningEffort, TokenUsage } from '@shared/types'
import { providerExtraBody, providerHeaders, shouldOmitTemperature } from './providers'
import { iterateSseData } from './sse'

export type ChatContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatContentPart[]
}

export interface StreamChatResult {
  content: string
  reasoning?: string
  usage: TokenUsage | null
}

export interface StreamChatOptions {
  baseUrl: string
  apiKey?: string
  model: string
  provider?: LlmProviderId
  reasoningEffort?: ReasoningEffort | null
  temperature?: number
  messages: ChatMessage[]
  signal?: AbortSignal
  maxRetries?: number
  onDelta?: (delta: string) => void
  onReasoningDelta?: (delta: string) => void
}

export type StreamChatCompletionFn = (options: StreamChatOptions) => Promise<StreamChatResult>

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504])
const MAX_RETRY_DELAY_MS = 5000

export class ModelHttpError extends Error {
  status: number
  body: string

  constructor(status: number, body: string) {
    super(`模型接口返回 ${status}${body ? `：${body.slice(0, 300)}` : ''}`)
    this.name = 'ModelHttpError'
    this.status = status
    this.body = body
  }
}

export function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error('模型 Base URL 不能为空')
  if (trimmed.endsWith('/chat/completions')) return trimmed
  return `${trimmed}/chat/completions`
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function abortError(): Error {
  const error = new Error('请求已取消')
  error.name = 'AbortError'
  return error
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function retryDelay(attempt: number, response?: Response): number {
  const header = response?.headers.get('retry-after')
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS)
    }
  }
  const base = Math.min(300 * 2 ** attempt, MAX_RETRY_DELAY_MS)
  return base + Math.floor(Math.random() * 120)
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: { signal?: AbortSignal; maxRetries: number }
): Promise<Response> {
  let attempt = 0
  for (;;) {
    let response: Response
    try {
      response = await fetch(url, init)
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) throw abortError()
      if (attempt >= options.maxRetries) throw error
      await delay(retryDelay(attempt), options.signal)
      attempt += 1
      continue
    }

    if (!RETRYABLE_STATUS.has(response.status) || attempt >= options.maxRetries) {
      return response
    }

    await response.body?.cancel().catch(() => undefined)
    await delay(retryDelay(attempt, response), options.signal)
    attempt += 1
  }
}

async function ensureOk(response: Response): Promise<void> {
  if (response.ok) return
  const body = await response.text().catch(() => '')
  throw new ModelHttpError(response.status, body)
}

function firstChoice(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const choice = choices[0]
  return typeof choice === 'object' && choice !== null ? (choice as Record<string, unknown>) : null
}

function extractDelta(payload: unknown): string | null {
  const choice = firstChoice(payload)
  if (!choice) return null
  const delta = choice.delta
  if (typeof delta !== 'object' || delta === null) return null
  const content = (delta as { content?: unknown }).content
  return typeof content === 'string' ? content : null
}

function extractReasoningDelta(payload: unknown): string | null {
  const choice = firstChoice(payload)
  if (!choice) return null
  const delta = choice.delta
  if (typeof delta !== 'object' || delta === null) return null
  const record = delta as Record<string, unknown>
  for (const key of ['reasoning_content', 'reasoning', 'thinking'] as const) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

function extractMessageContent(payload: unknown): string | null {
  const choice = firstChoice(payload)
  if (!choice) return null
  const message = choice.message
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
  const providerOptions = {
    provider: options.provider,
    reasoningEffort: options.reasoningEffort
  }
  const requestBody = (includeUsage: boolean): string =>
    JSON.stringify({
      model: options.model,
      messages: options.messages,
      ...(options.temperature !== undefined && !shouldOmitTemperature(providerOptions)
        ? { temperature: options.temperature }
        : {}),
      stream: true,
      ...providerExtraBody(providerOptions),
      ...(includeUsage ? { stream_options: { include_usage: true } } : {})
    })

  const send = (includeUsage: boolean): Promise<Response> =>
    fetchWithRetry(
      buildChatCompletionsUrl(options.baseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(options.apiKey),
          ...providerHeaders(options.provider)
        },
        body: requestBody(includeUsage),
        signal: options.signal
      },
      { signal: options.signal, maxRetries: options.maxRetries ?? 2 }
    )

  let response = await send(true)
  if (!response.ok && (response.status === 400 || response.status === 422)) {
    const body = await response.text().catch(() => '')
    if (!streamOptionsRetryPattern.test(body)) {
      throw new ModelHttpError(response.status, body)
    }
    response = await send(false)
  }
  await ensureOk(response)
  if (!response.body) throw new Error('模型接口没有返回流式内容')

  let full = ''
  let reasoning = ''
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
    const reasoningDelta = extractReasoningDelta(payload)
    if (reasoningDelta) {
      reasoning += reasoningDelta
      options.onReasoningDelta?.(reasoningDelta)
    }
    const delta = extractDelta(payload)
    if (delta) {
      full += delta
      options.onDelta?.(delta)
    }
  }
  return { content: full, reasoning, usage }
}

export async function completeChat(
  options: Omit<StreamChatOptions, 'onDelta' | 'onReasoningDelta' | 'signal'> & {
    signal?: AbortSignal
    maxTokens?: number
  }
): Promise<string> {
  const providerOptions = {
    provider: options.provider,
    reasoningEffort: options.reasoningEffort
  }
  const response = await fetchWithRetry(
    buildChatCompletionsUrl(options.baseUrl),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(options.apiKey),
        ...providerHeaders(options.provider)
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        ...(options.temperature !== undefined && !shouldOmitTemperature(providerOptions)
          ? { temperature: options.temperature }
          : {}),
        stream: false,
        ...(options.maxTokens !== undefined && !shouldOmitTemperature(providerOptions)
          ? { max_tokens: options.maxTokens }
          : {}),
        ...providerExtraBody(providerOptions)
      }),
      signal: options.signal
    },
    { signal: options.signal, maxRetries: options.maxRetries ?? 2 }
  )
  await ensureOk(response)
  const payload = (await response.json()) as unknown
  const content = extractMessageContent(payload)
  if (content === null) throw new Error('模型接口返回了无法解析的内容')
  return content
}
