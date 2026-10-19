import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '@main/db/client'
import { generateNodeTitle, sanitizeNodeTitle } from '@main/chat/nodeTitleService'
import { createNodeRepository } from '@main/db/repositories/nodes'
import { createProjectRepository } from '@main/db/repositories/projects'
import { createTestDatabase } from '../helpers'

let handle: DatabaseHandle

beforeEach(() => {
  handle = createTestDatabase()
})

afterEach(() => {
  handle.sqlite.close()
})

describe('节点标题服务', () => {
  it('清洗模型输出中的前缀、引号与结尾标点', () => {
    expect(sanitizeNodeTitle('标题：递归与分治')).toBe('递归与分治')
    expect(sanitizeNodeTitle('“动态规划入门”')).toBe('动态规划入门')
    expect(sanitizeNodeTitle('  ##  树的遍历？  ')).toBe('树的遍历')
    expect(sanitizeNodeTitle('a'.repeat(40))).toHaveLength(24)
    expect(sanitizeNodeTitle('   ')).toBe('')
  })

  it('基于对话内容生成标题并做长度限制', async () => {
    const project = createProjectRepository(handle.db).create({ name: 'P' })
    const nodes = createNodeRepository(handle.db)
    const node = nodes.create({
      projectId: project.id,
      parentId: null,
      userContent: '请解释什么是递归'
    })
    nodes.completeAssistant(node.id, '递归是函数调用自身的一种方法。')

    let capturedPrompt = ''
    const title = await generateNodeTitle({
      db: handle.db,
      nodeId: node.id,
      profile: { baseUrl: 'http://localhost:1/v1', model: 'm', temperature: 0.3 },
      completeFn: async (options) => {
        const content = options.messages[0]?.content
        capturedPrompt =
          typeof content === 'string'
            ? content
            : (content ?? []).map((part) => (part.type === 'text' ? part.text : '')).join('')
        return '标题：递归入门'
      }
    })

    expect(title).toBe('递归入门')
    expect(capturedPrompt).toContain('请解释什么是递归')
    expect(capturedPrompt).toContain('递归是函数调用自身的一种方法。')
  })

  it('模型返回空标题时抛出错误', async () => {
    const project = createProjectRepository(handle.db).create({ name: 'P' })
    const nodes = createNodeRepository(handle.db)
    const node = nodes.create({ projectId: project.id, parentId: null, userContent: 'x' })

    await expect(
      generateNodeTitle({
        db: handle.db,
        nodeId: node.id,
        profile: { baseUrl: 'http://localhost:1/v1', model: 'm', temperature: 0.3 },
        completeFn: async () => '   '
      })
    ).rejects.toThrow('模型未返回有效标题')
  })
})
