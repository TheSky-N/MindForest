import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { AttachmentKind, ChatAttachmentInput } from '@shared/types'
import { newId } from '../db/ids'

export const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024
export const MAX_ATTACHMENT_TEXT_CHARS = 200_000

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.jsonl',
  '.csv',
  '.tsv',
  '.log',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.xml',
  '.html',
  '.htm',
  '.css',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.c',
  '.h',
  '.cpp',
  '.sh',
  '.sql'
])

export interface StoredAttachment {
  id: string
  kind: AttachmentKind
  name: string
  mimeType: string
  size: number
  storagePath: string
  textContent: string | null
}

export function isTextLike(mimeType: string, name: string): boolean {
  if (mimeType.startsWith('text/')) return true
  if (
    /^(application\/(json|xml|x-yaml|yaml|javascript|typescript)|image\/svg\+xml)$/.test(mimeType)
  ) {
    return true
  }
  return TEXT_EXTENSIONS.has(extname(name).toLowerCase())
}

export function classifyAttachment(mimeType: string): AttachmentKind {
  return mimeType.startsWith('image/') ? 'image' : 'file'
}

export function sanitizeAttachmentName(name: string): string {
  const cleaned = Array.from(basename(name))
    .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
  return cleaned.slice(0, 120) || 'attachment'
}

function decodeBase64(input: string): Buffer {
  const payload = input.includes(',') ? input.slice(input.indexOf(',') + 1) : input
  return Buffer.from(payload, 'base64')
}

export function extractTextContent(buffer: Buffer, mimeType: string, name: string): string | null {
  if (!isTextLike(mimeType, name)) return null
  const text = buffer.toString('utf8').split('\u0000').join('').trim()
  return text.slice(0, MAX_ATTACHMENT_TEXT_CHARS)
}

export function saveChatAttachments(
  root: string,
  nodeId: string,
  inputs: ChatAttachmentInput[]
): StoredAttachment[] {
  if (inputs.length === 0) return []
  const nodeDir = join(root, nodeId)
  mkdirSync(nodeDir, { recursive: true })
  const stored: StoredAttachment[] = []

  for (const input of inputs.slice(0, 8)) {
    const name = sanitizeAttachmentName(input.name)
    const buffer = decodeBase64(input.dataBase64)
    if (buffer.byteLength === 0) continue
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new Error(`附件「${name}」超过 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB 限制`)
    }
    const kind = classifyAttachment(input.mimeType)
    const id = newId()
    const fileName = `${id}-${name}`
    const storagePath = join(nodeId, fileName)
    writeFileSync(join(root, storagePath), buffer)
    stored.push({
      id,
      kind,
      name,
      mimeType: input.mimeType || 'application/octet-stream',
      size: buffer.byteLength,
      storagePath,
      textContent: extractTextContent(buffer, input.mimeType, name)
    })
  }
  return stored
}

export function readImageDataUrl(
  root: string,
  storagePath: string,
  mimeType: string
): string | null {
  try {
    const buffer = readFileSync(join(root, storagePath))
    return `data:${mimeType || 'image/png'};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

export function readAttachmentDataUrl(
  root: string,
  storagePath: string,
  mimeType: string
): string | null {
  try {
    const buffer = readFileSync(join(root, storagePath))
    return `data:${mimeType || 'application/octet-stream'};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}
