import { describe, expect, it } from 'vitest'
import { createTestDatabase } from '../helpers'

describe('数据库迁移', () => {
  it('启动迁移会创建全部核心表', () => {
    const { sqlite } = createTestDatabase()
    const rows = sqlite
      .prepare("select name from sqlite_master where type = 'table'")
      .all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)

    expect(names).toEqual(
      expect.arrayContaining([
        'projects',
        'cards',
        'conversations',
        'messages',
        'message_quotes',
        'card_summaries',
        'llm_profiles',
        'settings'
      ])
    )
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)

    sqlite.close()
  })
})
