import { app, BrowserWindow, clipboard, ipcMain, shell, type WebContents } from 'electron'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { IPC } from '@shared/ipc'
import type {
  ChatAttachmentInput,
  ChatDeltaEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  HistoryExportFormat,
  LlmProfile,
  LlmProfileInput,
  MigrationReport,
  QuoteInput
} from '@shared/types'
import { normalizeLlmCapabilities, normalizeTaskPreferences } from '@shared/types'
import type { AppDatabase } from '../db/client'
import { closeDatabase, getDatabaseHandle, getDatabasePath } from '../db'
import { createProjectRepository } from '../db/repositories/projects'
import { createNodeRepository } from '../db/repositories/nodes'
import {
  createLlmProfileRepository,
  parseProvider,
  parseReasoningEffort
} from '../db/repositories/llmProfiles'
import { createQuoteRepository } from '../db/repositories/quotes'
import { createClusterRepository } from '../db/repositories/clusters'
import { createSettingsRepository } from '../db/repositories/settings'
import type { SettingsRepository } from '../db/repositories/settings'
import { createAttachmentRepository } from '../db/repositories/attachments'
import { createSearchRepository } from '../db/repositories/search'
import { readAttachmentDataUrl } from '../attachments/storage'
import {
  createBackup,
  isBackupFile,
  listBackups,
  pruneBackups,
  restoreBackupFile
} from '../backup/backupService'
import { isSecureStorageAvailable } from '../secureStore'
import { clearApiKey, getApiKey, hasSessionApiKey, storeApiKey } from '../security/apiKeys'
import { createChatService, type ChatEventSink, type RuntimeProfile } from '../chat/chatService'
import { editNode, purgeNode, restoreNode, softDeleteNode } from '../chat/nodeService'
import { generateNodeTitle } from '../chat/nodeTitleService'
import { completeChat } from '../llm/client'
import { refreshChainDigest } from '../llm/chainSummaryService'
import { generateClusterSummary } from '../llm/clusterSummaryService'
import { saveHistoryExport } from '../export/historyExport'
import { createClusterFromSelection } from '../topics/clusterService'

const MIGRATION_REPORT_KEY = 'migration.v2.report'
const TASK_PREFERENCES_KEY = 'preferences.tasks'

function safeSend(sender: WebContents, channel: string, payload: unknown): void {
  if (sender.isDestroyed()) return
  sender.send(channel, payload)
}

export function registerIpcHandlers(options: {
  db: AppDatabase
  settings?: SettingsRepository
}): void {
  const { db } = options
  const projects = createProjectRepository(db)
  const nodes = createNodeRepository(db)
  const profiles = createLlmProfileRepository(db)
  const quotes = createQuoteRepository(db)
  const clusters = createClusterRepository(db)
  const settings = options.settings ?? createSettingsRepository(db)
  const attachmentRepo = createAttachmentRepository(db)
  const searchRepo = createSearchRepository(db)
  const backupDir = join(app.getPath('userData'), 'backups')
  const attachmentsRoot = join(app.getPath('userData'), 'attachments')

  const clusterSummarizing = new Set<string>()

  const decorate = (profile: LlmProfile): LlmProfile => ({
    ...profile,
    hasApiKey: profile.hasApiKey || hasSessionApiKey(profile.id)
  })

  function resolveTaskProfile(): RuntimeProfile {
    let preferredId = ''
    try {
      const raw = settings.get(TASK_PREFERENCES_KEY)
      if (raw) preferredId = normalizeTaskPreferences(JSON.parse(raw)).summaryProfileId
    } catch {
      preferredId = ''
    }
    const row = (preferredId ? profiles.getRow(preferredId) : undefined) ?? profiles.getActiveRow()
    if (!row) throw new Error('请先在「模型设置」中配置并启用一个模型')
    const apiKey = getApiKey(row.id, row.apiKeyEncrypted) ?? undefined
    let capabilities: ReturnType<typeof normalizeLlmCapabilities> | undefined
    try {
      capabilities = normalizeLlmCapabilities(JSON.parse(row.capabilities))
    } catch {
      void 0
    }
    return {
      provider: parseProvider(row.provider),
      baseUrl: row.baseUrl,
      model: row.model,
      temperature: row.temperature,
      capabilities,
      reasoningEffort: parseReasoningEffort(row.reasoningEffort),
      apiKey
    }
  }

  const digestInFlight = new Set<string>()

  const scheduleChainDigest = (nodeId: string): void => {
    try {
      if (digestInFlight.has(nodeId)) return
      const profile = resolveTaskProfile()
      digestInFlight.add(nodeId)
      void refreshChainDigest({ db, nodeId, profile })
        .catch(() => undefined)
        .finally(() => digestInFlight.delete(nodeId))
    } catch {
      void 0
    }
  }

  const scheduleClusterSummary = (clusterId: string, sender: WebContents): void => {
    try {
      if (clusterSummarizing.has(clusterId)) return
      const profile = resolveTaskProfile()
      clusterSummarizing.add(clusterId)
      void generateClusterSummary({ db, clusterId, profile })
        .then(() => {
          const updated = clusters.getWithMembers(clusterId)
          if (updated) safeSend(sender, IPC.treeClusterUpdated, updated)
        })
        .catch(() => undefined)
        .finally(() => clusterSummarizing.delete(clusterId))
    } catch {
      void 0
    }
  }

  const chatService = createChatService({
    db,
    onTurnSettled: scheduleChainDigest,
    attachmentsRoot
  })

  const chatEvents = (sender: WebContents): ChatEventSink => ({
    delta: (payload: ChatDeltaEvent) => safeSend(sender, IPC.chatDelta, payload),
    done: (payload: ChatDoneEvent) => safeSend(sender, IPC.chatDone, payload),
    error: (payload: ChatErrorEvent) => safeSend(sender, IPC.chatError, payload)
  })

  ipcMain.handle(IPC.appGetInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    dbPath: getDatabasePath(),
    backupDir,
    secureStorageAvailable: isSecureStorageAvailable()
  }))

  ipcMain.handle(IPC.appOpenDataDir, () => shell.openPath(dirname(getDatabasePath())))

  ipcMain.handle(IPC.appOpenBackupsDir, () => {
    mkdirSync(backupDir, { recursive: true })
    return shell.openPath(backupDir)
  })

  ipcMain.handle(IPC.appListBackups, () => listBackups(backupDir))

  ipcMain.handle(IPC.appBackupNow, async () => {
    const backup = await createBackup(getDatabaseHandle().sqlite, backupDir, 'manual')
    pruneBackups(backupDir)
    return backup
  })

  ipcMain.handle(IPC.appRestoreBackup, async (_event, input: { fileName: string }) => {
    if (!isBackupFile(input.fileName)) throw new Error('无效的备份文件')
    const backupPath = join(backupDir, input.fileName)
    const handle = getDatabaseHandle()
    await createBackup(handle.sqlite, backupDir, 'pre-restore')
    closeDatabase()
    restoreBackupFile(backupPath, getDatabasePath())
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle(
    IPC.searchQuery,
    (_event, input: { query: string; projectId?: string; limit?: number }) =>
      searchRepo.query(input)
  )

  ipcMain.handle(IPC.attachmentsRead, (_event, input: { id: string }) => {
    const meta = attachmentRepo.get(input.id)
    if (!meta) return null
    const storage = attachmentRepo.getStoragePath(input.id)
    if (!storage) return null
    const dataUrl = readAttachmentDataUrl(attachmentsRoot, storage.storagePath, storage.mimeType)
    if (!dataUrl) return null
    return { dataUrl, mimeType: meta.mimeType, name: meta.name }
  })

  ipcMain.handle(IPC.appSetZoom, (event, input: { scale: number }) => {
    const percent = Math.min(Math.max(Number(input.scale) || 100, 50), 200)
    BrowserWindow.fromWebContents(event.sender)?.webContents.setZoomFactor(percent / 100)
  })

  ipcMain.handle(IPC.appCopyText, (_event, input: { text: string }) => {
    clipboard.writeText(String(input.text ?? ''))
  })

  ipcMain.handle(IPC.appMigrationReport, (): MigrationReport | null => {
    const raw = settings.get(MIGRATION_REPORT_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as MigrationReport
    } catch {
      return null
    }
  })

  ipcMain.handle(
    IPC.settingsGet,
    (_event, input: { key: string }) => settings.get(input.key) ?? null
  )
  ipcMain.handle(IPC.settingsSet, (_event, input: { key: string; value: string }) => {
    settings.set(input.key, input.value)
  })

  ipcMain.handle(IPC.projectsList, () => projects.list())
  ipcMain.handle(IPC.projectsCreate, (_event, input: { name: string }) => ({
    project: projects.create({ name: input.name.trim() || '未命名项目' }),
    rootNode: null
  }))
  ipcMain.handle(IPC.projectsRename, (_event, input: { id: string; name: string }) =>
    projects.rename(input.id, input.name.trim() || '未命名项目')
  )
  ipcMain.handle(IPC.projectsDelete, (_event, input: { id: string }) => projects.delete(input.id))

  ipcMain.handle(IPC.treeListNodes, (_event, input: { projectId: string }) =>
    nodes.listMetaByProject(input.projectId)
  )

  ipcMain.handle(IPC.treeGetPath, (_event, input: { nodeId: string }) => {
    const path = nodes.getPath(input.nodeId)
    const quotesByNode = new Map<string, ReturnType<typeof quotes.listByNode>>()
    const attachmentsByNode = new Map<string, ReturnType<typeof attachmentRepo.listByNode>>()
    for (const node of path) {
      quotesByNode.set(node.id, quotes.listByNode(node.id))
      attachmentsByNode.set(node.id, attachmentRepo.listByNode(node.id))
    }
    return path.map((node) => ({
      ...node,
      quotes: quotesByNode.get(node.id) ?? [],
      attachments: attachmentsByNode.get(node.id) ?? []
    }))
  })

  ipcMain.handle(IPC.treeListClusters, (_event, input: { projectId: string }) =>
    clusters.listWithMembers(input.projectId)
  )

  ipcMain.handle(
    IPC.treeCreateCluster,
    (event, input: { projectId: string; nodeIds: string[]; title?: string }) => {
      const result = createClusterFromSelection(db, input)
      scheduleClusterSummary(result.cluster.id, event.sender)
      return result
    }
  )

  ipcMain.handle(IPC.treeRenameCluster, (_event, input: { id: string; title: string }) =>
    clusters.rename(input.id, input.title)
  )

  ipcMain.handle(IPC.treeSummarizeCluster, async (event, input: { id: string }) => {
    const updated = await generateClusterSummary({
      db,
      clusterId: input.id,
      profile: resolveTaskProfile()
    })
    if (!updated) throw new Error('该主题没有可总结的对话')
    const withMembers = clusters.getWithMembers(input.id)
    if (withMembers) safeSend(event.sender, IPC.treeClusterUpdated, withMembers)
    return updated
  })

  ipcMain.handle(
    IPC.treeSetClusterCollapsed,
    (_event, input: { id: string; collapsed: boolean }) => {
      clusters.setCollapsed(input.id, input.collapsed)
    }
  )

  ipcMain.handle(IPC.treeDeleteCluster, (_event, input: { id: string }) => {
    clusters.delete(input.id)
  })

  ipcMain.handle(IPC.treeSetMainBranch, (_event, input: { nodeId: string }) =>
    nodes.setMainBranch(input.nodeId)
  )
  ipcMain.handle(IPC.treeSetArchived, (_event, input: { nodeId: string; archived: boolean }) =>
    nodes.setArchived(input.nodeId, input.archived)
  )
  ipcMain.handle(IPC.treeSetCollapsed, (_event, input: { nodeId: string; collapsed: boolean }) =>
    nodes.setCollapsed(input.nodeId, input.collapsed)
  )
  ipcMain.handle(
    IPC.treeSetAnswerCollapsed,
    (_event, input: { nodeId: string; collapsed: boolean }) =>
      nodes.setAnswerCollapsed(input.nodeId, input.collapsed)
  )
  ipcMain.handle(
    IPC.treeSetUserCollapsed,
    (_event, input: { nodeId: string; collapsed: boolean | null }) =>
      nodes.setUserCollapsed(input.nodeId, input.collapsed)
  )

  ipcMain.handle(IPC.treeDeleteNode, (_event, input: { nodeId: string }) => {
    softDeleteNode(db, input.nodeId)
  })
  ipcMain.handle(IPC.treeRestoreNode, (_event, input: { nodeId: string }) => {
    restoreNode(db, input.nodeId)
  })
  ipcMain.handle(IPC.treePurgeNode, (_event, input: { nodeId: string }) => {
    purgeNode(db, input.nodeId)
  })
  ipcMain.handle(IPC.treeListDeleted, (_event, input: { projectId: string }) =>
    nodes.listDeleted(input.projectId)
  )

  ipcMain.handle(
    IPC.treeEditNode,
    (_event, input: { nodeId: string; content: string; syncGroup?: boolean }) => editNode(db, input)
  )

  ipcMain.handle(IPC.treeRenameNode, (_event, input: { nodeId: string; title: string | null }) =>
    nodes.renameNode(input.nodeId, input.title)
  )

  ipcMain.handle(IPC.treeGenerateNodeTitle, async (_event, input: { nodeId: string }) => {
    const title = await generateNodeTitle({
      db,
      nodeId: input.nodeId,
      profile: resolveTaskProfile()
    })
    return nodes.setGeneratedTitle(input.nodeId, title)
  })

  ipcMain.handle(IPC.llmProfilesList, () => profiles.list().map(decorate))

  ipcMain.handle(IPC.llmProfilesCreate, (_event, input: LlmProfileInput) => {
    let profile = profiles.create({
      name: input.name.trim() || '未命名配置',
      provider: parseProvider(input.provider),
      baseUrl: input.baseUrl.trim(),
      model: input.model.trim(),
      temperature: input.temperature,
      capabilities: input.capabilities ? normalizeLlmCapabilities(input.capabilities) : undefined,
      reasoningEffort: parseReasoningEffort(input.reasoningEffort),
      apiKeyEncrypted: null
    })
    if (input.apiKey) {
      profile = profiles.update(profile.id, {
        apiKeyEncrypted: storeApiKey(profile.id, input.apiKey)
      })
    }
    if (!profiles.getActiveRow()) {
      profile = profiles.setActive(profile.id)
    }
    return decorate(profile)
  })

  ipcMain.handle(
    IPC.llmProfilesUpdate,
    (_event, input: { id: string } & Partial<LlmProfileInput>) => {
      const patch: {
        name?: string
        provider?: ReturnType<typeof parseProvider>
        baseUrl?: string
        model?: string
        temperature?: number
        capabilities?: ReturnType<typeof normalizeLlmCapabilities>
        reasoningEffort?: ReturnType<typeof parseReasoningEffort>
        apiKeyEncrypted?: string | null
      } = {}
      if (input.name !== undefined) patch.name = input.name.trim() || '未命名配置'
      if (input.provider !== undefined) patch.provider = parseProvider(input.provider)
      if (input.baseUrl !== undefined) patch.baseUrl = input.baseUrl.trim()
      if (input.model !== undefined) patch.model = input.model.trim()
      if (input.temperature !== undefined) patch.temperature = input.temperature
      if (input.capabilities !== undefined) {
        patch.capabilities = normalizeLlmCapabilities(input.capabilities)
      }
      if (input.reasoningEffort !== undefined) {
        patch.reasoningEffort = parseReasoningEffort(input.reasoningEffort)
      }
      if (input.apiKey !== undefined) {
        if (input.apiKey === '') {
          clearApiKey(input.id)
          patch.apiKeyEncrypted = null
        } else {
          patch.apiKeyEncrypted = storeApiKey(input.id, input.apiKey)
        }
      }
      return decorate(profiles.update(input.id, patch))
    }
  )

  ipcMain.handle(IPC.llmProfilesRemove, (_event, input: { id: string }) => {
    clearApiKey(input.id)
    profiles.remove(input.id)
  })

  ipcMain.handle(IPC.llmProfilesSetActive, (_event, input: { id: string }) =>
    decorate(profiles.setActive(input.id))
  )

  ipcMain.handle(IPC.llmProfilesTest, async (_event, input: { id: string }) => {
    try {
      const row = profiles.getRow(input.id)
      if (!row) throw new Error('模型配置不存在')
      const apiKey = getApiKey(row.id, row.apiKeyEncrypted) ?? undefined
      const reply = await completeChat({
        provider: parseProvider(row.provider),
        baseUrl: row.baseUrl,
        model: row.model,
        temperature: row.temperature,
        reasoningEffort: parseReasoningEffort(row.reasoningEffort),
        apiKey,
        messages: [{ role: 'user', content: '请只回复四个字：连接成功' }],
        maxTokens: 32
      })
      return { ok: true, reply: reply.trim() }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(
    IPC.chatSend,
    async (
      event,
      input: {
        projectId: string
        parentId: string | null
        content: string
        quotes?: QuoteInput[]
        attachments?: ChatAttachmentInput[]
      }
    ) => {
      return chatService.send({
        projectId: input.projectId,
        parentId: input.parentId,
        content: input.content,
        quotes: input.quotes,
        attachments: input.attachments,
        profile: resolveTaskProfile(),
        events: chatEvents(event.sender)
      })
    }
  )

  ipcMain.handle(IPC.chatRegenerate, async (event, input: { nodeId: string }) => {
    return chatService.regenerate({
      nodeId: input.nodeId,
      profile: resolveTaskProfile(),
      events: chatEvents(event.sender)
    })
  })

  ipcMain.handle(IPC.chatCancel, (_event, input: { requestId: string }) => {
    chatService.cancel(input.requestId)
  })

  ipcMain.handle(
    IPC.exportSaveHistory,
    (_event, input: { projectId: string; nodeId?: string; format: HistoryExportFormat }) =>
      saveHistoryExport(db, input)
  )
}
