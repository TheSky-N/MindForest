import { _electron as electron, expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MindForestApi } from '../src/shared/api'

let server: Server
let mockPort: number

test.beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/v1/chat/completions') {
      let body = ''
      request.on('data', (chunk) => {
        body += chunk
      })
      request.on('end', () => {
        let stream: boolean
        try {
          stream = JSON.parse(body).stream !== false
        } catch {
          stream = true
        }
        if (!stream) {
          response.writeHead(200, { 'Content-Type': 'application/json' })
          response.end(
            JSON.stringify({
              choices: [{ message: { role: 'assistant', content: 'AI 主题标题' } }]
            })
          )
          return
        }
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.write('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n')
        response.end('data: [DONE]\n\n')
      })
      return
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  mockPort = address.port
})

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

test('完整闭环：建项目、配模型、流式对话并落库', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mindforest-e2e-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`]
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  const result = await window.evaluate(
    async ({ port }) => {
      const api = (window as unknown as { mindforest: MindForestApi }).mindforest
      const donePromise = new Promise<{ status: string; content: string }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('等待完成事件超时')), 15000)
        const off = api.chat.onDone((event) => {
          off()
          clearTimeout(timeout)
          resolve({ status: event.message.status, content: event.message.content })
        })
      })

      const project = await api.projects.create({ name: 'E2E 项目' })
      await api.llmProfiles.create({
        name: 'Mock',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: 'mock-model'
      })
      const conversation = await api.conversations.getByCard({ cardId: project.rootCard.id })
      await api.chat.send({ conversationId: conversation.id, content: '你好' })
      const done = await donePromise
      const messages = await api.messages.list({ conversationId: conversation.id })
      const info = await api.app.getInfo()

      return {
        dbPath: info.dbPath,
        doneStatus: done.status,
        doneContent: done.content,
        messageCount: messages.length
      }
    },
    { port: mockPort }
  )

  expect(result.dbPath).toContain(userDataDir)
  expect(result.doneStatus).toBe('complete')
  expect(result.doneContent).toBe('你好')
  expect(result.messageCount).toBe(2)

  await app.close()
})

test('主题偏好持久化与面板折叠生效', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mindforest-e2e-theme-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`]
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')
  await window.waitForTimeout(900)

  const initial = await window.evaluate(() => {
    const sidebar = document.getElementById('sidebar')
    return {
      mode: document.documentElement.dataset.mode,
      theme: document.documentElement.dataset.theme,
      sidebarWidth: sidebar ? sidebar.getBoundingClientRect().width : 0
    }
  })
  expect(initial.mode).toBe('dark')
  expect(initial.theme).toBe('forest')
  expect(initial.sidebarWidth).toBeGreaterThan(100)

  await window.click('button[title="折叠侧栏"]')
  await window.waitForTimeout(400)
  const collapsedWidth = await window.evaluate(() => {
    const sidebar = document.getElementById('sidebar')
    return sidebar ? sidebar.getBoundingClientRect().width : -1
  })
  expect(collapsedWidth).toBeLessThan(5)

  await window.evaluate(async () => {
    const api = (window as unknown as { mindforest: MindForestApi }).mindforest
    await api.settings.set({
      key: 'preferences.appearance',
      value: JSON.stringify({ mode: 'light', themeId: 'nord', fontUi: '', fontCode: '' })
    })
  })
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')
  await window.waitForTimeout(900)

  const after = await window.evaluate(() => ({
    mode: document.documentElement.dataset.mode,
    theme: document.documentElement.dataset.theme,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    sidebarWidth: document.getElementById('sidebar')?.getBoundingClientRect().width ?? 0
  }))
  expect(after.mode).toBe('light')
  expect(after.theme).toBe('nord')
  expect(after.bodyBg).toBe('rgb(233, 237, 244)')
  expect(after.sidebarWidth).toBeGreaterThan(100)

  await app.close()
})

test('卡片树：向下布局、从卡片建分支、自动标题与右键菜单', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mindforest-e2e-tree-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`]
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')

  const seeded = await window.evaluate(
    async ({ port }) => {
      const api = (window as unknown as { mindforest: MindForestApi }).mindforest
      const { project, rootCard } = await api.projects.create({ name: '树测试' })
      await api.llmProfiles.create({
        name: 'Mock',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: 'mock-model'
      })
      const child = await api.cards.createChild({ parentCardId: rootCard.id })
      const conversation = await api.conversations.getByCard({ cardId: child.id })
      const donePromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('等待完成事件超时')), 15000)
        const off = api.chat.onDone(() => {
          off()
          clearTimeout(timeout)
          resolve()
        })
      })
      await api.chat.send({ conversationId: conversation.id, content: '父节点问题' })
      await donePromise
      return { projectId: project.id, rootCardId: rootCard.id, childId: child.id }
    },
    { port: mockPort }
  )

  await expect
    .poll(
      async () =>
        window.evaluate(
          async ({ projectId, childId }) => {
            const api = (window as unknown as { mindforest: MindForestApi }).mindforest
            const cards = await api.cards.listByProject({ projectId })
            const child = cards.find((card) => card.id === childId)
            return child
              ? { title: child.title, generated: child.titleGenerated }
              : { title: '', generated: false }
          },
          { projectId: seeded.projectId, childId: seeded.childId }
        ),
      { timeout: 15000 }
    )
    .toEqual({ title: 'AI 主题标题', generated: true })

  const branch = await window.evaluate(async (childId) => {
    const api = (window as unknown as { mindforest: MindForestApi }).mindforest
    const card = await api.cards.createBranch({ sourceCardId: childId })
    return { kind: card.kind, inherited: card.inheritedContext ?? '' }
  }, seeded.childId)
  expect(branch.kind).toBe('branch')
  expect(branch.inherited).toContain('父节点问题')

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)

  const layoutCheck = await window.evaluate(
    ({ rootCardId, childId }) => {
      const rootEl = document.querySelector(`.react-flow__node[data-id="${rootCardId}"]`)
      const childEl = document.querySelector(`.react-flow__node[data-id="${childId}"]`)
      if (!rootEl || !childEl) return null
      return {
        childBelowRoot:
          childEl.getBoundingClientRect().top > rootEl.getBoundingClientRect().top
      }
    },
    { rootCardId: seeded.rootCardId, childId: seeded.childId }
  )
  expect(layoutCheck?.childBelowRoot).toBe(true)

  const before = await window.evaluate(
    () => document.querySelectorAll('.react-flow__node').length
  )
  await window.locator('.react-flow__node').first().click({ button: 'right' })
  await window.waitForSelector('text=建立子卡片')
  const menuItems = await window.locator('div.fixed.z-50 button').count()
  expect(menuItems).toBe(5)
  await window.locator('text=建立子卡片').click()
  await window.waitForTimeout(700)
  const after = await window.evaluate(
    () => document.querySelectorAll('.react-flow__node').length
  )
  expect(after).toBe(before + 1)

  await app.close()
})
