import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core'

const now = sql`(unixepoch() * 1000)`

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now)
}

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ...timestamps
})

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    parentCardId: text('parent_card_id').references((): AnySQLiteColumn => cards.id, {
      onDelete: 'cascade'
    }),
    kind: text('kind', { enum: ['root', 'child', 'branch'] }).notNull(),
    branchFromMessageId: text('branch_from_message_id'),
    inheritedContext: text('inherited_context'),
    title: text('title').notNull(),
    titleGenerated: integer('title_generated', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps
  },
  (t) => [
    index('cards_project_idx').on(t.projectId),
    index('cards_parent_idx').on(t.parentCardId),
    index('cards_branch_from_idx').on(t.branchFromMessageId)
  ]
)

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    title: text('title'),
    ...timestamps
  },
  (t) => [index('conversations_card_idx').on(t.cardId)]
)

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    turnIndex: integer('turn_index').notNull(),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull().default(''),
    status: text('status', { enum: ['streaming', 'complete', 'aborted', 'error'] })
      .notNull()
      .default('complete'),
    model: text('model'),
    errorMessage: text('error_message'),
    isActiveVariant: integer('is_active_variant', { mode: 'boolean' }).notNull().default(true),
    ...timestamps
  },
  (t) => [index('messages_conversation_turn_idx').on(t.conversationId, t.turnIndex)]
)

export const messageQuotes = sqliteTable(
  'message_quotes',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    quotedMessageId: text('quoted_message_id'),
    quoteText: text('quote_text').notNull(),
    ...timestamps
  },
  (t) => [index('message_quotes_message_idx').on(t.messageId)]
)

export const cardSummaries = sqliteTable('card_summaries', {
  cardId: text('card_id')
    .primaryKey()
    .references(() => cards.id, { onDelete: 'cascade' }),
  summarizedMessageCount: integer('summarized_message_count').notNull(),
  summarizedTokenCount: integer('summarized_token_count').notNull(),
  summary: text('summary').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now)
})

export const llmProfiles = sqliteTable('llm_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  model: text('model').notNull(),
  temperature: real('temperature').notNull().default(0.7),
  apiKeyEncrypted: text('api_key_encrypted'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  ...timestamps
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now)
})

export const nodes = sqliteTable(
  'nodes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): AnySQLiteColumn => nodes.id, {
      onDelete: 'cascade'
    }),
    userContent: text('user_content').notNull(),
    assistantContent: text('assistant_content').notNull().default(''),
    assistantStatus: text('assistant_status', {
      enum: ['streaming', 'complete', 'aborted', 'error']
    })
      .notNull()
      .default('complete'),
    assistantError: text('assistant_error'),
    model: text('model'),
    turnGroupId: text('turn_group_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    isMainBranch: integer('is_main_branch', { mode: 'boolean' }).notNull().default(false),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    isCollapsed: integer('is_collapsed', { mode: 'boolean' }).notNull().default(false),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    ...timestamps
  },
  (t) => [
    index('nodes_project_idx').on(t.projectId),
    index('nodes_parent_idx').on(t.parentId),
    index('nodes_turn_group_idx').on(t.turnGroupId)
  ]
)

export const nodeQuotes = sqliteTable(
  'node_quotes',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    quotedNodeId: text('quoted_node_id').references((): AnySQLiteColumn => nodes.id, {
      onDelete: 'set null'
    }),
    quoteText: text('quote_text').notNull(),
    ...timestamps
  },
  (t) => [index('node_quotes_node_idx').on(t.nodeId)]
)

export const topicClusters = sqliteTable(
  'topic_clusters',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    titleGenerated: integer('title_generated', { mode: 'boolean' }).notNull().default(false),
    summary: text('summary'),
    color: text('color'),
    isCollapsed: integer('is_collapsed', { mode: 'boolean' }).notNull().default(true),
    ...timestamps
  },
  (t) => [index('topic_clusters_project_idx').on(t.projectId)]
)

export const topicClusterNodes = sqliteTable(
  'topic_cluster_nodes',
  {
    clusterId: text('cluster_id')
      .notNull()
      .references(() => topicClusters.id, { onDelete: 'cascade' }),
    nodeId: text('node_id')
      .notNull()
      .unique()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0)
  },
  (t) => [index('topic_cluster_nodes_cluster_idx').on(t.clusterId)]
)

export const nodeDigests = sqliteTable('node_digests', {
  boundaryNodeId: text('boundary_node_id')
    .primaryKey()
    .references(() => nodes.id, { onDelete: 'cascade' }),
  digest: text('digest').notNull(),
  coveredNodeCount: integer('covered_node_count').notNull(),
  coveredTokenCount: integer('covered_token_count').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now)
})

export type ProjectRow = typeof projects.$inferSelect
export type CardRow = typeof cards.$inferSelect
export type ConversationRow = typeof conversations.$inferSelect
export type MessageRow = typeof messages.$inferSelect
export type MessageQuoteRow = typeof messageQuotes.$inferSelect
export type CardSummaryRow = typeof cardSummaries.$inferSelect
export type LlmProfileRow = typeof llmProfiles.$inferSelect
export type NodeRow = typeof nodes.$inferSelect
export type NodeQuoteRow = typeof nodeQuotes.$inferSelect
export type TopicClusterRow = typeof topicClusters.$inferSelect
export type TopicClusterNodeRow = typeof topicClusterNodes.$inferSelect
export type NodeDigestRow = typeof nodeDigests.$inferSelect
