import { describe, expect, it } from 'vitest'
import { createTestDatabase } from '../helpers'

describe('数据库迁移', () => {
  it('启动迁移会创建全部核心表（含 v0.2.0 对话树表）', () => {
    const { sqlite } = createTestDatabase()
    const rows = sqlite
      .prepare("select name from sqlite_master where type = 'table'")
      .all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)

    expect(names).toEqual(
      expect.arrayContaining([
        'projects',
        'nodes',
        'node_quotes',
        'node_digests',
        'topic_clusters',
        'topic_cluster_nodes',
        'attachments',
        'nodes_fts',
        'llm_profiles',
        'settings',
        'cards',
        'conversations',
        'messages',
        'message_quotes',
        'card_summaries'
      ])
    )
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)

    const nodeColumns = (
      sqlite.prepare("pragma table_info('nodes')").all() as Array<{ name: string }>
    ).map((column) => column.name)
    expect(nodeColumns).toEqual(
      expect.arrayContaining([
        'turn_group_id',
        'is_main_branch',
        'is_archived',
        'is_collapsed',
        'answer_collapsed',
        'user_collapsed',
        'title',
        'title_generated',
        'prompt_tokens',
        'completion_tokens',
        'deleted_at',
        'assistant_status',
        'assistant_reasoning'
      ])
    )

    const profileColumns = (
      sqlite.prepare("pragma table_info('llm_profiles')").all() as Array<{ name: string }>
    ).map((column) => column.name)
    expect(profileColumns).toEqual(
      expect.arrayContaining(['provider', 'capabilities', 'reasoning_effort'])
    )

    const triggers = (
      sqlite.prepare("select name from sqlite_master where type = 'trigger'").all() as Array<{
        name: string
      }>
    ).map((row) => row.name)
    expect(triggers).toEqual(
      expect.arrayContaining(['nodes_fts_ai', 'nodes_fts_ad', 'nodes_fts_au'])
    )

    const clusterColumns = (
      sqlite.prepare("pragma table_info('topic_cluster_nodes')").all() as Array<{ name: string }>
    ).map((column) => column.name)
    expect(clusterColumns).toContain('node_id')

    sqlite.close()
  })
})
