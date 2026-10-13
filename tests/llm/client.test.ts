import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildChatCompletionsUrl, completeChat, streamChatCompletion } from '@main/llm/client'

let server: Server
let baseUrl: string

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/v1/chat/completions') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.write('data: {"choices":[{"delta":{"content":"你"}}]}\n\n')
      response.write('data: {"choices":[{"delta":{"content":"好"}}]}\n\n')
      response.end('data: [DONE]\n\n')
      return
    }
    if (request.url === '/v1/complete/chat/completions') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({ choices: [{ message: { role: 'assistant', content: '连接成功' } }] })
      )
      return
    }
    if (request.url === '/v1/error/chat/completions') {
      response.writeHead(500, { 'Content-Type': 'application/json' })
      response.end('{"error":"boom"}')
      return
    }
    if (request.url === '/v1/slow/chat/completions') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.write('data: {"choices":[{"delta":{"content":"a"}}]}\n\n')
      setTimeout(() => {
        response.end('data: [DONE]\n\n')
      }, 500)
      return
    }
    response.writeHead(404)
    response.end()
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

  it('流式聚合与增量回调', async () => {
    const deltas: string[] = []
    const full = await streamChatCompletion({
      baseUrl: `${baseUrl}/v1`,
      model: 'test-model',
      messages: [{ role: 'user', content: '你好' }],
      onDelta: (delta) => deltas.push(delta)
    })
    expect(full).toBe('你好')
    expect(deltas).toEqual(['你', '好'])
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
