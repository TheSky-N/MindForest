import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { HistoryExportFormat, HistoryExportResult, TurnNode } from '@shared/types'
import type { AppDatabase } from '../db/client'
import { createAttachmentRepository } from '../db/repositories/attachments'
import { createClusterRepository } from '../db/repositories/clusters'
import { createNodeRepository } from '../db/repositories/nodes'
import { createProjectRepository } from '../db/repositories/projects'
import { createQuoteRepository } from '../db/repositories/quotes'

export interface HistoryExportInput {
  projectId: string
  nodeId?: string
  format: HistoryExportFormat
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatTimestamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fileStamp(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

function sanitizeFileName(name: string): string {
  const cleaned = Array.from(name.replace(/[\\/:*?"<>|]/g, '_'))
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
  return cleaned.trim().slice(0, 50) || '对话'
}

function tokenLine(node: TurnNode): string | null {
  const prompt = node.promptTokens
  const completion = node.completionTokens
  if (prompt === null && completion === null) return null
  return `输入 ${prompt ?? '未知'} tok · 输出 ${completion ?? '未知'} tok`
}

export function buildPathMarkdown(db: AppDatabase, nodeId: string): string {
  const path = createNodeRepository(db).getPath(nodeId)
  if (path.length === 0) throw new Error('节点不存在')
  const project = createProjectRepository(db).get(path[0]!.projectId)
  const quoteRepo = createQuoteRepository(db)
  const attachmentRepo = createAttachmentRepository(db)
  const lines: string[] = []
  lines.push(`# ${project?.name ?? '对话历史'}`)
  lines.push('')
  lines.push(`> 导出时间：${formatTimestamp(new Date())} · 共 ${path.length} 轮`)

  path.forEach((node, index) => {
    lines.push('', '---', '', `## 第 ${index + 1} 轮`, '')
    const nodeQuotes = quoteRepo.listByNode(node.id)
    for (const quote of nodeQuotes) {
      lines.push(`> 引用：${quote.quoteText.replace(/\r?\n/g, '\n> ')}`)
    }
    if (nodeQuotes.length > 0) lines.push('')
    lines.push('**用户**', '', node.userContent, '')
    const nodeAttachments = attachmentRepo.listByNode(node.id)
    for (const attachment of nodeAttachments) {
      lines.push(`> 附件：${attachment.name}（${attachment.mimeType}）`)
    }
    if (nodeAttachments.length > 0) lines.push('')
    if (node.assistantReasoning.trim()) {
      lines.push(
        '**思考过程**',
        '',
        '<details>',
        '<summary>展开思考过程</summary>',
        '',
        node.assistantReasoning,
        '',
        '</details>',
        ''
      )
    }
    const modelLabel = node.model ? `（${node.model}）` : ''
    lines.push(`**AI${modelLabel}**`, '')
    if (node.assistantContent.trim()) {
      lines.push(node.assistantContent)
    } else if (node.assistantStatus === 'error') {
      lines.push(`（生成失败：${node.assistantError ?? '未知错误'}）`)
    } else if (node.assistantStatus === 'aborted') {
      lines.push('（已停止生成）')
    } else {
      lines.push('（空回复）')
    }
    const tokens = tokenLine(node)
    if (tokens) lines.push('', `*${tokens}*`)
  })
  lines.push('')
  return lines.join('\n')
}

export function buildProjectJson(db: AppDatabase, projectId: string): string {
  const project = createProjectRepository(db).get(projectId)
  if (!project) throw new Error('项目不存在')
  const allNodes = createNodeRepository(db)
    .listByProject(projectId)
    .filter((node) => !node.deletedAt)
  const quotes = createQuoteRepository(db).listByNodes(allNodes.map((node) => node.id))
  const attachmentRows = createAttachmentRepository(db).listByNodes(allNodes.map((node) => node.id))
  const clusters = createClusterRepository(db).listWithMembers(projectId)
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      project,
      nodes: allNodes,
      clusters,
      quotes,
      attachments: attachmentRows
    },
    null,
    2
  )
}

export async function saveHistoryExport(
  db: AppDatabase,
  input: HistoryExportInput
): Promise<HistoryExportResult> {
  const { app, dialog } = await import('electron')
  const project = createProjectRepository(db).get(input.projectId)
  if (!project) throw new Error('项目不存在')

  const isMarkdown = input.format === 'markdown'
  if (isMarkdown && !input.nodeId) throw new Error('请先选择要导出的对话节点')
  const content = isMarkdown
    ? buildPathMarkdown(db, input.nodeId!)
    : buildProjectJson(db, project.id)

  const extension = isMarkdown ? 'md' : 'json'
  const label = isMarkdown ? '对话路径' : '完整数据'
  const defaultName = `${sanitizeFileName(project.name)}-${label}-${fileStamp(new Date())}.${extension}`
  const options = {
    title: isMarkdown ? '导出当前对话路径' : '导出项目完整数据',
    defaultPath: join(app.getPath('downloads'), defaultName),
    filters: isMarkdown
      ? [
          { name: 'Markdown', extensions: ['md'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      : [
          { name: 'JSON', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ]
  }
  const result = await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { canceled: true, filePath: null }
  await writeFile(result.filePath, content, 'utf8')
  return { canceled: false, filePath: result.filePath }
}
