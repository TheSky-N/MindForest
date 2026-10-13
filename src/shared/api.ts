import type {
  AppInfo,
  ChatDeltaEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  ChatSendResult,
  ClusterWithMembers,
  DeletedNodeInfo,
  LlmProfile,
  LlmProfileInput,
  LlmProfileTestResult,
  MigrationReport,
  NodeMeta,
  NodePathEntry,
  Project,
  QuoteInput,
  TopicCluster,
  TurnNode
} from './types'

export interface MindForestApi {
  app: {
    getInfo(): Promise<AppInfo>
    openDataDir(): Promise<void>
    migrationReport(): Promise<MigrationReport | null>
  }
  settings: {
    get(input: { key: string }): Promise<string | null>
    set(input: { key: string; value: string }): Promise<void>
  }
  projects: {
    list(): Promise<Project[]>
    create(input: { name: string }): Promise<{ project: Project; rootNode: TurnNode | null }>
    rename(input: { id: string; name: string }): Promise<Project>
    delete(input: { id: string }): Promise<void>
  }
  tree: {
    listNodes(input: { projectId: string }): Promise<NodeMeta[]>
    getPath(input: { nodeId: string }): Promise<NodePathEntry[]>
    listClusters(input: { projectId: string }): Promise<ClusterWithMembers[]>
    createCluster(input: {
      projectId: string
      nodeIds: string[]
      title?: string
    }): Promise<{ cluster: ClusterWithMembers; addedNodeCount: number }>
    renameCluster(input: { id: string; title: string }): Promise<TopicCluster>
    summarizeCluster(input: { id: string }): Promise<TopicCluster>
    setClusterCollapsed(input: { id: string; collapsed: boolean }): Promise<void>
    deleteCluster(input: { id: string }): Promise<void>
    setMainBranch(input: { nodeId: string }): Promise<TurnNode>
    setArchived(input: { nodeId: string; archived: boolean }): Promise<TurnNode>
    setCollapsed(input: { nodeId: string; collapsed: boolean }): Promise<TurnNode>
    deleteNode(input: { nodeId: string }): Promise<void>
    restoreNode(input: { nodeId: string }): Promise<void>
    purgeNode(input: { nodeId: string }): Promise<void>
    listDeleted(input: { projectId: string }): Promise<DeletedNodeInfo[]>
    editNode(input: {
      nodeId: string
      content: string
      syncGroup?: boolean
    }): Promise<TurnNode>
    onClusterUpdated(callback: (cluster: ClusterWithMembers) => void): () => void
  }
  llmProfiles: {
    list(): Promise<LlmProfile[]>
    create(input: LlmProfileInput): Promise<LlmProfile>
    update(input: { id: string } & Partial<LlmProfileInput>): Promise<LlmProfile>
    remove(input: { id: string }): Promise<void>
    setActive(input: { id: string }): Promise<LlmProfile>
    test(input: { id: string }): Promise<LlmProfileTestResult>
  }
  chat: {
    send(input: {
      projectId: string
      parentId: string | null
      content: string
      quotes?: QuoteInput[]
    }): Promise<ChatSendResult>
    regenerate(input: { nodeId: string }): Promise<ChatSendResult>
    cancel(input: { requestId: string }): Promise<void>
    onDelta(callback: (event: ChatDeltaEvent) => void): () => void
    onDone(callback: (event: ChatDoneEvent) => void): () => void
    onError(callback: (event: ChatErrorEvent) => void): () => void
  }
}
