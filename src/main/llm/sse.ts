export function extractSseData(rawEvent: string): string | null {
  const dataLines: string[] = []
  for (const line of rawEvent.split('\n')) {
    const normalized = line.endsWith('\r') ? line.slice(0, -1) : line
    if (normalized.startsWith('data:')) dataLines.push(normalized.slice(5).trimStart())
  }
  if (dataLines.length === 0) return null
  return dataLines.join('\n')
}

export async function* iterateSseData(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, undefined> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  function* flushEvents(): Generator<string> {
    while (true) {
      const match = /\r?\n\r?\n/.exec(buffer)
      if (!match || match.index === undefined) break
      const rawEvent = buffer.slice(0, match.index)
      buffer = buffer.slice(match.index + match[0].length)
      const data = extractSseData(rawEvent)
      if (data !== null) yield data
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      yield* flushEvents()
    }
    buffer += decoder.decode()
    yield* flushEvents()
    if (buffer.trim().length > 0) {
      const data = extractSseData(buffer)
      if (data !== null) yield data
    }
  } finally {
    reader.releaseLock()
  }
}
