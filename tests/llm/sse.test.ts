import { describe, expect, it } from 'vitest'
import { extractSseData, iterateSseData } from '@main/llm/sse'

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
}

describe('SSE 解析', () => {
  it('解析被任意拆分的 data 事件', async () => {
    const stream = streamFrom(['data: {"a":', '1}\n\ndata: [DO', 'NE]\n\n'])
    const events: string[] = []
    for await (const data of iterateSseData(stream)) events.push(data)
    expect(events).toEqual(['{"a":1}', '[DONE]'])
  })

  it('兼容 CRLF 分隔与注释行', async () => {
    const stream = streamFrom([': keep-alive\r\n\r\ndata: hello\r\n\r\n'])
    const events: string[] = []
    for await (const data of iterateSseData(stream)) events.push(data)
    expect(events).toEqual(['hello'])
  })

  it('处理结尾没有空行的最后一个事件', async () => {
    const stream = streamFrom(['data: tail'])
    const events: string[] = []
    for await (const data of iterateSseData(stream)) events.push(data)
    expect(events).toEqual(['tail'])
  })

  it('extractSseData 合并多行 data 并忽略非 data 行', () => {
    expect(extractSseData('data: a\ndata: b')).toBe('a\nb')
    expect(extractSseData('event: ping')).toBeNull()
    expect(extractSseData('data: [DONE]')).toBe('[DONE]')
  })
})
