import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildChatCompletionsUrl, completeChat, streamChatCompletion } from '@main/llm/client'

let server: Server
let baseUrl: string
let retryAttempts = 0

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    request.on('data', (chunk) => {
      data += String(chunk)
    })
    request.on('end', () => resolve(data))
  })
}

beforeAll(async () => {
  server = createServer((request, response) => {
    void (async () => {
      const url = request.url ?? ''
      if (url === '/v1/chat/completions') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.write('data: {"choices":[{"delta":{"content":"你"}}]}\n\n')
        response.write('data: {"choices":[{"delta":{"content":"好"}}]}\n\n')
        response.write(
          'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n'
        )
        response.end('data: [DONE]\n\n')
        return
      }
      if (url === '/v1/ollama/chat/completions') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.write(
          'data: {"choices":[{"delta":{"content":"嗨"}}],"usage":{"prompt_eval_count":7,"eval_count":3}}\n\n'
        )
        response.end('data: [DONE]\n\n')
        return
      }
      if (url === '/v1/no-stream-options/chat/completions') {
        const body = await readBody(request)
        if (body.includes('stream_options')) {
          response.writeHead(400, { 'Content-Type': 'application/json' })
          response.end('{"error":{"message":"Unknown parameter: stream_options"}}')
          return
        }
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.write('data: {"choices":[{"delta":{"content":"退"}}]}\n\n')
        response.write('data: {"choices":[{"delta":{"content":"回"}}]}\n\n')
        response.end('data: [DONE]\n\n')
        return
      }
      if (url === '/v1/complete/chat/completions') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({ choices: [{ message: { role: 'assistant', content: '连接成功' } }] })
        )
        return
      }
      if (url === '/v1/error/chat/completions') {
        response.writeHead(500, { 'Content-Type': 'application/json' })
        response.end('{"error":"boom"}')
        return
      }
      if (url === '/v1/reasoning/chat/completions') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.write('data: {"choices":[{"delta":{"reasoning_content":"先想"}}]}\n\n')
        response.write('data: {"choices":[{"delta":{"content":"再答"}}]}\n\n')
        response.end('data: [DONE]\n\n')
        return
      }
      if (url === '/v1/retry/chat/completions') {
        retryAttempts += 1
        if (retryAttempts < 3) {
          response.writeHead(503, { 'Content-Type': 'application/json' })
          response.end('{"error":"busy"}')
          return
        }
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.write('data: {"choices":[{"delta":{"content":"重试成功"}}]}\n\n')
        response.end('data: [DONE]\n\n')
        return
      }
      if (url === '/v1/slow/chat/completions') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.write('data: {"choices":[{"delta":{"content":"a"}}]}\n\n')
        setTimeout(() => {
          response.end('data: [DONE]\n\n')
        }, 500)
        return
      }
      response.writeHead(404)
      response.end()
    })()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('LLM 客户端', () => {
  it('拼接 chat/completions 路径', () => {
    expect(buildChatCompletionsUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions'
    )
    expect(buildChatCompletionsUrl('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions'
    )
    expect(() => buildChatCompletionsUrl('  ')).toThrow()
  })

  it('流式聚合与增量回调，并解析 usage', async () => {
    const deltas: string[] = []
    const result = await streamChatCompletion({
      baseUrl: `${baseUrl}/v1`,
      model: 'test-model',
      messages: [{ role: 'user', content: '你好' }],
      onDelta: (delta) => deltas.push(delta)
    })
    expect(result.content).toBe('你好')
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 2 })
    expect(deltas).toEqual(['你', '好'])
  })

  it('解析 reasoning_content 并回调', async () => {
    const reasoningDeltas: string[] = []
    const contentDeltas: string[] = []
    const result = await streamChatCompletion({
      baseUrl: `${baseUrl}/v1/reasoning`,
      model: 'test-model',
      messages: [{ role: 'user', content: '你好' }],
      onReasoningDelta: (delta) => reasoningDeltas.push(delta),
      onDelta: (delta) => contentDeltas.push(delta)
    })
    expect(result.reasoning).toBe('先想')
    expect(result.content).toBe('再答')
    expect(reasoningDeltas).toEqual(['先想'])
    expect(contentDeltas).toEqual(['再答'])
  })

  it('503 会自动退避重试', async () => {
    retryAttempts = 0
    const result = await streamChatCompletion({
      baseUrl: `${baseUrl}/v1/retry`,
      model: 'test-model',
      messages: [{ role: 'user', content: '你好' }],
      maxRetries: 2
    })
    expect(result.content).toBe('重试成功')
    expect(retryAttempts).toBe(3)
  })

  it('兼容 Ollama 风格的 usage 字段', async () => {
    const result = await streamChatCompletion({
      baseUrl: `${baseUrl}/v1/ollama`,
      model: 'test-model',
      messages: [{ role: 'user', content: '你好' }]
    })
    expect(result.content).toBe('嗨')
    expect(result.usage).toEqual({ promptTokens: 7, completionTokens: 3 })
  })

  it('接口拒绝 stream_options 时自动去参重试', async () => {
    const result = await streamChatCompletion({
      baseUrl: `${baseUrl}/v1/no-stream-options`,
      model: 'test-model',
      messages: [{ role: 'user', content: '你好' }]
    })
    expect(result.content).toBe('退回')
    expect(result.usage).toBeNull()
  })

  it('非流式请求解析 message.content', async () => {
    const reply = await completeChat({
      baseUrl: `${baseUrl}/v1/complete`,
      model: 'test-model',
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 16
    })
    expect(reply).toBe('连接成功')
  })

  it('非 2xx 响应抛出带响应体的错误', async () => {
    await expect(
      streamChatCompletion({
        baseUrl: `${baseUrl}/v1/error`,
        model: 'test-model',
        messages: [{ role: 'user', content: '你好' }]
      })
    ).rejects.toThrow(/500/)
  })

  it('中止请求会抛出 AbortError', async () => {
    const controller = new AbortController()
    const promise = streamChatCompletion({
      baseUrl: `${baseUrl}/v1/slow`,
      model: 'test-model',
      messages: [{ role: 'user', content: '你好' }],
      signal: controller.signal,
      onDelta: () => controller.abort()
    })
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })
})
