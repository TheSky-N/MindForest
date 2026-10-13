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
      request.resume()
      request.on('end', () => {
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
