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
          const content = body.includes('标题助手')
            ? '标题：递归入门'
            : '标题：测试主题\n\n摘要：模拟摘要'
          response.writeHead(200, { 'Content-Type': 'application/json' })
          response.end(
            JSON.stringify({
              choices: [{ message: { role: 'assistant', content } }]
            })
          )
          return
        }
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.write(
          'data: {"choices":[{"delta":{"content":"你好\\n第一行\\n第二行\\n\\n第三行"}}]}\n\n'
        )
        response.write(
          'data: {"choices":[],"usage":{"prompt_tokens":33,"completion_tokens":11,"total_tokens":44}}\n\n'
        )
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

test('完整闭环：首条消息创建根节点，继续创建子节点', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mindforest-e2e-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`]
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')

  const result = await window.evaluate(
    async ({ port }) => {
      const api = (window as unknown as { mindforest: MindForestApi }).mindforest
      const waitDone = () =>
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('等待完成事件超时')), 15000)
          const off = api.chat.onDone(() => {
            off()
            clearTimeout(timeout)
            resolve()
          })
        })

      const { project } = await api.projects.create({ name: 'E2E 项目' })
      await api.llmProfiles.create({
        name: 'Mock',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: 'mock-model'
      })
      const firstDone = waitDone()
      const first = await api.chat.send({ projectId: project.id, parentId: null, content: '你好' })
      await firstDone
      const secondDone = waitDone()
      await api.chat.send({
        projectId: project.id,
        parentId: first.node.id,
        content: '继续'
      })
      await secondDone

      const nodes = await api.tree.listNodes({ projectId: project.id })
      const firstNode = nodes.find((node) => node.id === first.node.id)
      const statuses = nodes.map((node) => node.assistantStatus)

      const regenDone = waitDone()
      const regenerated = await api.chat.regenerate({ nodeId: first.node.id })
      await regenDone
      await api.tree.deleteNode({ nodeId: regenerated.node.id })
      const nodesAfterDelete = await api.tree.listNodes({ projectId: project.id })
      const deleted = await api.tree.listDeleted({ projectId: project.id })
      const path = await api.tree.getPath({ nodeId: first.node.id })
      const firstPathEntry = path.find((node) => node.id === first.node.id)

      return {
        projectId: project.id,
        firstId: first.node.id,
        nodeCount: nodes.length,
        firstParent: firstNode ? firstNode.parentId : 'missing',
        statuses,
        promptTokens: firstPathEntry?.promptTokens ?? null,
        completionTokens: firstPathEntry?.completionTokens ?? null,
        regeneratedDeleted: deleted.some((item) => item.node.id === regenerated.node.id),
        originalAlive: nodesAfterDelete.some(
          (node) => node.id === first.node.id && node.deletedAt === null
        )
      }
    },
    { port: mockPort }
  )

  expect(result.nodeCount).toBe(2)
  expect(result.firstParent).toBeNull()
  expect(result.statuses).toEqual(['complete', 'complete'])
  expect(result.promptTokens).toBe(33)
  expect(result.completionTokens).toBe(11)
  expect(result.regeneratedDeleted).toBe(true)
  expect(result.originalAlive).toBe(true)

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
      value: JSON.stringify({
        mode: 'light',
        themeId: 'nord',
        fontUi: '',
        fontCode: '',
        tree: { aspect: '3:1', shape: 'rounded', edge: 'bezier' }
      })
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

test('主题对话树：簇折叠、主分支、归档与单击双击', async () => {
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
      const waitDone = () =>
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('等待完成事件超时')), 15000)
          const off = api.chat.onDone(() => {
            off()
            clearTimeout(timeout)
            resolve()
          })
        })

      const { project } = await api.projects.create({ name: '树测试' })
      await api.llmProfiles.create({
        name: 'Mock',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: 'mock-model'
      })
      const ids: string[] = []
      let parentId: string | null = null
      for (const content of ['第一问', '第二问', '第三问']) {
        const done = waitDone()
        const result = await api.chat.send({ projectId: project.id, parentId, content })
        await done
        ids.push(result.node.id)
        parentId = result.node.id
      }

      const clusterResult = await api.tree.createCluster({
        projectId: project.id,
        nodeIds: [ids[1]!, ids[2]!]
      })
      await api.tree.setMainBranch({ nodeId: ids[1]! })
      const afterMain = await api.tree.listNodes({ projectId: project.id })
      return {
        projectId: project.id,
        ids,
        clusterId: clusterResult.cluster.id,
        addedNodeCount: clusterResult.addedNodeCount,
        clusterMemberCount: clusterResult.cluster.nodeIds.length,
        mainFlag: afterMain.find((node) => node.id === ids[1])?.isMainBranch ?? false
      }
    },
    { port: mockPort }
  )

  expect(seeded.clusterMemberCount).toBe(2)
  expect(seeded.addedNodeCount).toBe(0)
  expect(seeded.mainFlag).toBe(true)

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(1000)

  const [firstId, secondId, thirdId] = seeded.ids
  const clusterVNodeId = `cluster:${seeded.clusterId}`

  const collapsed = await window.evaluate(
    ({ firstId, clusterVNodeId }) => {
      const first = document.querySelector(`.react-flow__node[data-id="${firstId}"]`)
      const clusterNode = document.querySelector(`.react-flow__node[data-id="${clusterVNodeId}"]`)
      return {
        count: document.querySelectorAll('.react-flow__node:not([data-id$=":box"])').length,
        hasCluster: Boolean(clusterNode),
        downward: Boolean(
          first && clusterNode && clusterNode.getBoundingClientRect().top > first.getBoundingClientRect().top
        )
      }
    },
    { firstId: firstId!, clusterVNodeId }
  )
  expect(collapsed.count).toBe(2)
  expect(collapsed.hasCluster).toBe(true)
  expect(collapsed.downward).toBe(true)

  await window.locator(`.react-flow__node[data-id="${firstId}"]`).click()
  await window.waitForSelector('text=预览中', { timeout: 5000 })
  await window.locator(`.react-flow__node[data-id="${firstId}"]`).dblclick()
  await expect(window.locator('text=预览中')).toHaveCount(0, { timeout: 5000 })

  await window.evaluate(async ({ projectId, firstNodeId }) => {
    const api = (window as unknown as { mindforest: MindForestApi }).mindforest
    void projectId
    await api.tree.setArchived({ nodeId: firstNodeId, archived: true })
  }, { projectId: seeded.projectId, firstNodeId: firstId! })
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)
  const archivedCount = await window.evaluate(
    () => document.querySelectorAll('.react-flow__node:not([data-id$=":box"])').length
  )
  expect(archivedCount).toBe(1)

  await window.evaluate(async ({ firstNodeId }) => {
    const api = (window as unknown as { mindforest: MindForestApi }).mindforest
    await api.tree.setArchived({ nodeId: firstNodeId, archived: false })
    await api.tree.setClusterCollapsed({ id: 'placeholder', collapsed: false }).catch(() => undefined)
  }, { firstNodeId: firstId! })
  await window.evaluate(async ({ clusterId }) => {
    const api = (window as unknown as { mindforest: MindForestApi }).mindforest
    await api.tree.setClusterCollapsed({ id: clusterId, collapsed: false })
  }, { clusterId: seeded.clusterId })
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)
  const expandedCount = await window.evaluate(
    () => document.querySelectorAll('.react-flow__node:not([data-id$=":box"])').length
  )
  expect(expandedCount).toBe(3)
  void secondId
  void thirdId

  await window.locator(`.react-flow__node[data-id="${firstId}"]`).click({ button: 'right' })
  await window.waitForSelector('text=进入并继续', { timeout: 5000 })
  await window.keyboard.press('Escape')
  await expect(window.locator('text=归档节点')).toHaveCount(0, { timeout: 5000 })

  await app.close()
})

test('token 徽标、回答折叠与输入框高度调整', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mindforest-e2e-chat-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`]
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')

  const seeded = await window.evaluate(
    async ({ port }) => {
      const api = (window as unknown as { mindforest: MindForestApi }).mindforest
      const waitDone = () =>
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('等待完成事件超时')), 15000)
          const off = api.chat.onDone(() => {
            off()
            clearTimeout(timeout)
            resolve()
          })
        })

      const { project } = await api.projects.create({ name: '聊天测试' })
      await api.llmProfiles.create({
        name: 'Mock',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: 'mock-model'
      })
      const done = waitDone()
      const first = await api.chat.send({ projectId: project.id, parentId: null, content: '你好' })
      await done
      return { projectId: project.id, firstId: first.node.id }
    },
    { port: mockPort }
  )

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)

  await window.locator(`.react-flow__node[data-id="${seeded.firstId}"]`).click()
  await window.waitForSelector('text=↑33 ↓11 tok', { timeout: 5000 })

  await window.locator('button[title="折叠回答"]').click()
  await expect(window.locator('[data-answer] .prose')).toHaveCount(0)
  await expect(window.locator('text=已折叠')).toHaveCount(1)

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)
  await window.locator(`.react-flow__node[data-id="${seeded.firstId}"]`).click()
  await window.waitForSelector('text=已折叠', { timeout: 5000 })
  await expect(window.locator('[data-answer] .prose')).toHaveCount(0)
  await window.locator('[title="展开回答"]').click()
  await window.waitForSelector('[data-answer] .prose', { timeout: 5000 })

  const handle = window.locator('[title^="拖动调整输入框高度"]')
  const box = await handle.boundingBox()
  if (!box) throw new Error('未找到输入框拖拽手柄')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  const beforeHeight = await window
    .locator('textarea')
    .first()
    .evaluate((element) => (element as HTMLTextAreaElement).offsetHeight)
  await window.mouse.move(startX, startY)
  await window.mouse.down()
  await window.mouse.move(startX, startY - 80, { steps: 8 })
  await window.mouse.up()
  const storedHeight = await window.evaluate(() =>
    Number(localStorage.getItem('mindforest.composer.height'))
  )
  expect(storedHeight).toBeGreaterThan(beforeHeight)

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)
  const afterReloadHeight = await window
    .locator('textarea')
    .first()
    .evaluate((element) => (element as HTMLTextAreaElement).offsetHeight)
  expect(Math.abs(afterReloadHeight - storedHeight)).toBeLessThanOrEqual(2)

  await app.close()
})

test('单轮查看、Markdown 开关、用户折叠与树样式', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mindforest-e2e-v022-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`]
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')

  const longMessage = Array.from({ length: 14 }, (_, index) => `折叠行 ${index + 1}`).join('\n')

  const seeded = await window.evaluate(
    async ({ port, longMessage }) => {
      const api = (window as unknown as { mindforest: MindForestApi }).mindforest
      const waitDone = () =>
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('等待完成事件超时')), 15000)
          const off = api.chat.onDone(() => {
            off()
            clearTimeout(timeout)
            resolve()
          })
        })
      const { project } = await api.projects.create({ name: 'v022 测试' })
      await api.llmProfiles.create({
        name: 'Mock',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: 'mock-model'
      })
      const ids: string[] = []
      let parentId: string | null = null
      for (const content of ['## 用户标题\n\n正文一', '第二轮', longMessage]) {
        const done = waitDone()
        const result = await api.chat.send({ projectId: project.id, parentId, content })
        await done
        ids.push(result.node.id)
        parentId = result.node.id
      }
      return { ids }
    },
    { port: mockPort, longMessage }
  )

  const updatePreferences = (patch: Record<string, unknown>) =>
    window.evaluate(async (patchValue) => {
      const api = (window as unknown as { mindforest: MindForestApi }).mindforest
      const raw = await api.settings.get({ key: 'preferences.appearance' })
      const prefs = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      Object.assign(prefs, patchValue)
      await api.settings.set({ key: 'preferences.appearance', value: JSON.stringify(prefs) })
    }, patch)

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)

  await window.locator(`.react-flow__node[data-id="${seeded.ids[1]}"]`).click()
  await window.waitForTimeout(400)
  await expect(window.locator('[data-turn-id]')).toHaveCount(1)
  await expect(window.locator('[data-turn-id]').first()).toContainText('第二轮')

  await updatePreferences({ chat: { viewMode: 'path' } })
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)
  await window.locator(`.react-flow__node[data-id="${seeded.ids[1]}"]`).click()
  await window.waitForTimeout(400)
  await expect(window.locator('[data-turn-id]')).toHaveCount(2)
  await expect(window.locator('h2:has-text("用户标题")')).toHaveCount(1)

  await window.locator(`.react-flow__node[data-id="${seeded.ids[2]}"]`).click()
  await window.waitForTimeout(500)
  await expect(window.locator('text=已折叠')).toHaveCount(1)
  await window.locator('button:has-text("展开")').first().click()
  await window.waitForTimeout(400)
  await expect(window.locator('[data-user-bubble]').last()).toContainText('折叠行 14')

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)
  await window.locator(`.react-flow__node[data-id="${seeded.ids[2]}"]`).click()
  await window.waitForTimeout(500)
  await expect(window.locator('[data-user-bubble]').last()).toContainText('折叠行 14')
  await expect(window.locator('text=已折叠')).toHaveCount(0)

  await updatePreferences({
    chat: { viewMode: 'path', renderUserMarkdown: false },
    tree: {
      aspect: '3:1',
      shape: 'rounded',
      edge: 'bezier',
      palettes: {
        forest: {
          current: { background: '#ff0000' },
          edges: { main: { color: '#123456' } }
        }
      }
    }
  })
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)
  await window.locator(`.react-flow__node[data-id="${seeded.ids[1]}"]`).click()
  await window.waitForTimeout(400)
  await expect(window.locator('h2:has-text("用户标题")')).toHaveCount(0)

  const rootBackground = await window
    .locator(`.react-flow__node[data-id="${seeded.ids[0]}"] > div`)
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(rootBackground).toBe('rgb(255, 0, 0)')

  const edgeStrokes = await window.evaluate(() =>
    Array.from(document.querySelectorAll('.react-flow__edge-path')).map(
      (element) => getComputedStyle(element).stroke
    )
  )
  expect(edgeStrokes).toContain('rgb(18, 52, 86)')

  await app.close()
})

test('多标签页：并行生成、切换恢复与持久化', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mindforest-e2e-tabs-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`]
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')

  await window.evaluate(
    async ({ port }) => {
      const api = (window as unknown as { mindforest: MindForestApi }).mindforest
      await api.projects.create({ name: '项目A' })
      await api.projects.create({ name: '项目B' })
      await api.llmProfiles.create({
        name: 'Mock',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: 'mock-model'
      })
    },
    { port: mockPort }
  )

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')
  await window.waitForTimeout(900)

  await expect(window.locator('[data-tab-id]')).toHaveCount(1)

  await window.locator('button:has-text("项目A")').first().click()
  await window.waitForTimeout(600)
  await expect(window.locator('[data-tab-id]')).toHaveCount(2)

  const waitDone = () =>
    window.evaluate(
      () =>
        new Promise<boolean>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('等待完成事件超时')), 15000)
          const off = (
            window as unknown as { mindforest: MindForestApi }
          ).mindforest.chat.onDone(() => {
            off()
            clearTimeout(timeout)
            resolve(true)
          })
        })
    )

  await window.locator('textarea').first().fill('A 问题')
  const doneA = waitDone()
  await window.locator('button:has-text("发送")').click()

  await window.locator('[data-tab-id]', { hasText: '项目B' }).first().click()
  await window.waitForTimeout(300)
  await window.locator('textarea').first().fill('B 问题')
  const doneB = waitDone()
  await window.locator('button:has-text("发送")').click()

  await Promise.all([doneA, doneB])
  await window.waitForTimeout(600)

  await expect(window.locator('[data-turn-id]').first()).toContainText('B 问题')
  await expect(window.locator('[data-answer]').first()).toContainText('你好')

  await window.locator('[data-tab-id]', { hasText: '项目A' }).first().click()
  await window.waitForTimeout(600)
  await expect(window.locator('[data-turn-id]').first()).toContainText('A 问题')
  await expect(window.locator('[data-answer]').first()).toContainText('你好')

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')
  await window.waitForTimeout(900)
  await expect(window.locator('[data-tab-id]')).toHaveCount(2)
  await expect(window.locator('[data-tab-id][data-active="true"]')).toHaveCount(1)

  await window.evaluate(async () => {
    const api = (window as unknown as { mindforest: MindForestApi }).mindforest
    const raw = await api.settings.get({ key: 'preferences.appearance' })
    const prefs = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    prefs.ui = { tabsPosition: 'left' }
    await api.settings.set({ key: 'preferences.appearance', value: JSON.stringify(prefs) })
  })
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')
  await window.waitForTimeout(900)
  await expect(window.locator('#tabbar')).toHaveCount(1)
  await expect(window.locator('#tabbar [data-tab-id]')).toHaveCount(2)

  await app.close()
})

test('重命名、复制、标点输入与外观设置', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mindforest-e2e-rename-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`]
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')

  const seeded = await window.evaluate(
    async ({ port }) => {
      const api = (window as unknown as { mindforest: MindForestApi }).mindforest
      const waitDone = () =>
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('等待完成事件超时')), 15000)
          const off = api.chat.onDone(() => {
            off()
            clearTimeout(timeout)
            resolve()
          })
        })
      const { project } = await api.projects.create({ name: '重命名测试' })
      await api.llmProfiles.create({
        name: 'Mock',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: 'mock-model'
      })
      const ids: string[] = []
      let parentId: string | null = null
      for (const content of ['用户手动重命名验证', 'AI 标题生成验证', '第三个节点用于配色断言']) {
        const done = waitDone()
        const result = await api.chat.send({ projectId: project.id, parentId, content })
        await done
        ids.push(result.node.id)
        parentId = result.node.id
      }
      return { ids }
    },
    { port: mockPort }
  )

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)

  await window
    .locator(`.react-flow__node[data-id="${seeded.ids[0]}"]`)
    .click({ button: 'right' })
  await window.locator('text=重命名节点').click()
  await window.locator('input').last().fill('手动标题')
  await window.locator('button:has-text("保存")').click()
  await window.waitForTimeout(400)
  await expect(
    window.locator(`.react-flow__node[data-id="${seeded.ids[0]}"]`)
  ).toContainText('手动标题')

  await window
    .locator(`.react-flow__node[data-id="${seeded.ids[1]}"]`)
    .click({ button: 'right' })
  await window.locator('text=AI 生成标题').click()
  await window.waitForTimeout(900)
  await expect(
    window.locator(`.react-flow__node[data-id="${seeded.ids[1]}"]`)
  ).toContainText('递归入门')

  await window.locator('button:has-text("重命名测试")').first().hover()
  await window.locator('button[title="重命名项目"]').first().click()
  await window.locator('input').last().fill('改名后的项目')
  await window.locator('button:has-text("保存")').click()
  await window.waitForTimeout(400)
  await expect(window.locator('button:has-text("改名后的项目")').first()).toBeVisible()

  await window.locator(`.react-flow__node[data-id="${seeded.ids[1]}"]`).click()
  await window.waitForTimeout(500)
  await window.locator('button[title="复制回答（Markdown）"]').first().click()
  await window.waitForTimeout(300)
  const clipboardText = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clipboardText).toContain('你好')
  expect(clipboardText).toContain('第三行')

  await window.locator('textarea').first().focus()
  const shiftPrevented = window.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const handler = (event: KeyboardEvent) => {
          if (event.key === 'Shift') {
            window.removeEventListener('keydown', handler)
            setTimeout(() => resolve(event.defaultPrevented), 0)
          }
        }
        window.addEventListener('keydown', handler)
      })
  )
  await window.keyboard.press('Shift+Digit9')
  expect(await shiftPrevented).toBe(false)

  await window.evaluate(async () => {
    const api = (window as unknown as { mindforest: MindForestApi }).mindforest
    const raw = await api.settings.get({ key: 'preferences.appearance' })
    const prefs = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    prefs.ui = { chatFontSize: 18, baseFontSize: 17 }
    prefs.tree = {
      palettes: { forest: { main: { background: '#123456' } } }
    }
    await api.settings.set({ key: 'preferences.appearance', value: JSON.stringify(prefs) })
  })
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)
  await window.locator(`.react-flow__node[data-id="${seeded.ids[1]}"]`).click()
  await window.waitForTimeout(500)

  const answerFontSize = await window
    .locator('[data-answer]')
    .first()
    .evaluate((element) => getComputedStyle(element).fontSize)
  expect(answerFontSize).toBe('18px')
  const rootFontSize = await window.evaluate(
    () => document.documentElement.style.fontSize
  )
  expect(rootFontSize).toBe('17px')
  const mainBackground = await window
    .locator(`.react-flow__node[data-id="${seeded.ids[2]}"] > div`)
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(mainBackground).toBe('rgb(18, 52, 86)')

  await app.close()
})

test('v0.2.4：新开分支编辑、Markdown 段落与深层主分支', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mindforest-e2e-v024a-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`]
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')

  const seeded = await window.evaluate(
    async ({ port }) => {
      const api = (window as unknown as { mindforest: MindForestApi }).mindforest
      const waitDone = () =>
        new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), 15000)
          const off = api.chat.onDone(() => {
            off()
            clearTimeout(t)
            resolve()
          })
        })
      const { project } = await api.projects.create({ name: 'v024A' })
      await api.llmProfiles.create({
        name: 'Mock',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: 'mock-model'
      })
      const ids: string[] = []
      let parentId: string | null = null
      for (const content of ['第一行\n第二行\n\n第三行', '第二个问题']) {
        const done = waitDone()
        const result = await api.chat.send({ projectId: project.id, parentId, content })
        await done
        ids.push(result.node.id)
        parentId = result.node.id
      }
      const done = waitDone()
      const regen = await api.chat.regenerate({ nodeId: ids[1]! })
      await done
      return { projectId: project.id, ids, regenId: regen.node.id }
    },
    { port: mockPort }
  )

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)

  await window.locator(`.react-flow__node[data-id="${seeded.ids[0]}"]`).click()
  await window.waitForTimeout(500)
  await expect(window.locator('[data-user-bubble] .prose p')).toHaveCount(2)
  await expect(window.locator('[data-user-bubble] .prose p br')).toHaveCount(0)
  await expect(window.locator('[data-answer] .prose p')).toHaveCount(2)
  await expect(window.locator('[data-answer] .prose p br')).toHaveCount(0)

  const waitDone = () =>
    window.evaluate(
      () =>
        new Promise<boolean>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), 15000)
          const off = (
            window as unknown as { mindforest: MindForestApi }
          ).mindforest.chat.onDone(() => {
            off()
            clearTimeout(t)
            resolve(true)
          })
        })
    )

  await window
    .locator(`.react-flow__node[data-id="${seeded.ids[0]}"]`)
    .click({ button: 'right' })
  await window.locator('text=编辑消息').click()
  await window.locator('textarea').last().fill('修改后的问题')
  const donePromise = waitDone()
  await window.locator('button:has-text("新开分支并发送")').click()
  await donePromise
  await window.waitForTimeout(600)

  await expect(window.locator('[data-turn-id]').first()).toContainText('修改后的问题')
  const afterEdit = await window.evaluate(
    async ({ projectId, rootId }) => {
      const api = (window as unknown as { mindforest: MindForestApi }).mindforest
      const nodes = await api.tree.listNodes({ projectId })
      return {
        originalAlive: nodes.some((node) => node.id === rootId && node.deletedAt === null),
        siblings: nodes.filter((node) => node.parentId === null && node.deletedAt === null).length
      }
    },
    { projectId: seeded.projectId, rootId: seeded.ids[0]! }
  )
  expect(afterEdit.originalAlive).toBe(true)
  expect(afterEdit.siblings).toBe(2)

  await window
    .locator(`.react-flow__node[data-id="${seeded.ids[1]}"]`)
    .click({ button: 'right' })
  await expect(window.locator('text=已是主分支')).toHaveCount(1)
  await window.keyboard.press('Escape')
  await window.waitForTimeout(200)
  await window
    .locator(`.react-flow__node[data-id="${seeded.regenId}"]`)
    .click({ button: 'right' })
  await window.locator('text=设为主分支').click()
  const flags = await window.evaluate(
    async ({ projectId, regenId, originalId }) => {
      const api = (window as unknown as { mindforest: MindForestApi }).mindforest
      const nodes = await api.tree.listNodes({ projectId })
      return {
        regenMain: nodes.find((node) => node.id === regenId)?.isMainBranch ?? false,
        originalMain: nodes.find((node) => node.id === originalId)?.isMainBranch ?? true
      }
    },
    { projectId: seeded.projectId, regenId: seeded.regenId, originalId: seeded.ids[1]! }
  )
  expect(flags.regenMain).toBe(true)
  expect(flags.originalMain).toBe(false)

  await app.close()
})

test('v0.2.4：卡内标签栏、折叠拖宽排序、从节点新建标签页与多选', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mindforest-e2e-v024b-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`]
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')

  const seeded = await window.evaluate(
    async ({ port }) => {
      const api = (window as unknown as { mindforest: MindForestApi }).mindforest
      const waitDone = () =>
        new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), 15000)
          const off = api.chat.onDone(() => {
            off()
            clearTimeout(t)
            resolve()
          })
        })
      const { project } = await api.projects.create({ name: '项目A' })
      await api.projects.create({ name: '项目B' })
      await api.llmProfiles.create({
        name: 'Mock',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: 'mock-model'
      })
      const ids: string[] = []
      let parentId: string | null = null
      for (const content of ['第一问', '第二问']) {
        const done = waitDone()
        const result = await api.chat.send({ projectId: project.id, parentId, content })
        await done
        ids.push(result.node.id)
        parentId = result.node.id
      }
      return { ids }
    },
    { port: mockPort }
  )

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.react-flow__node')
  await window.waitForTimeout(900)

  const insideCard = await window.evaluate(() => {
    const tab = document.querySelector('[data-tab-id]')
    return Boolean(tab && tab.closest('.rounded-xl.bg-card'))
  })
  expect(insideCard).toBe(true)

  await window.locator('button:has-text("项目B")').first().click()
  await window.waitForTimeout(500)
  await expect(window.locator('[data-tab-id]')).toHaveCount(2)

  const readOrder = () =>
    window.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-tab-id]')).map(
        (element) => element.dataset.tabId
      )
    )
  const orderBefore = await readOrder()
  const firstBox = await window.locator('[data-tab-id]').first().boundingBox()
  const secondBox = await window.locator('[data-tab-id]').nth(1).boundingBox()
  if (!firstBox || !secondBox) throw new Error('未找到标签页')
  await window.mouse.move(
    firstBox.x + firstBox.width / 2,
    firstBox.y + firstBox.height / 2
  )
  await window.mouse.down()
  await window.mouse.move(
    secondBox.x + secondBox.width / 2 + 30,
    secondBox.y + secondBox.height / 2,
    { steps: 10 }
  )
  await window.mouse.up()
  await window.waitForTimeout(400)
  const orderAfter = await readOrder()
  expect(orderAfter[0]).toBe(orderBefore[1])
  expect(orderAfter[1]).toBe(orderBefore[0])

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('header')
  await window.waitForTimeout(900)
  expect(await readOrder()).toEqual(orderAfter)

  await window.evaluate(async () => {
    const api = (window as unknown as { mindforest: MindForestApi }).mindforest
    const raw = await api.settings.get({ key: 'preferences.appearance' })
    const prefs = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    prefs.ui = { tabsPosition: 'left' }
    await api.settings.set({ key: 'preferences.appearance', value: JSON.stringify(prefs) })
  })
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForTimeout(900)
  await expect(window.locator('#tabbar')).toHaveCount(1)
  const expandedWidth = await window
    .locator('#tabbar')
    .evaluate((element) => element.getBoundingClientRect().width)
  await window.click('button[title="折叠标签页"]')
  await window.waitForTimeout(300)
  const collapsedWidth = await window
    .locator('#tabbar')
    .evaluate((element) => element.getBoundingClientRect().width)
  expect(collapsedWidth).toBeLessThan(40)
  expect(expandedWidth).toBeGreaterThan(100)
  await window.click('button[title="展开标签页"]')
  await window.waitForTimeout(300)

  const handle = window.locator('[title^="拖动调整标签栏宽度"]')
  const handleBox = await handle.boundingBox()
  if (!handleBox) throw new Error('未找到宽度拖拽手柄')
  await window.mouse.move(handleBox.x + 2, handleBox.y + handleBox.height / 2)
  await window.mouse.down()
  await window.mouse.move(handleBox.x + 80, handleBox.y + handleBox.height / 2, { steps: 6 })
  await window.mouse.up()
  await window.waitForTimeout(250)
  const storedWidth = await window.evaluate(() =>
    Number(localStorage.getItem('mindforest.tabs.width'))
  )
  expect(storedWidth).toBeGreaterThan(176)
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForTimeout(900)
  const persistedWidth = await window
    .locator('#tabbar')
    .evaluate((element) => element.getBoundingClientRect().width)
  expect(Math.abs(persistedWidth - storedWidth)).toBeLessThanOrEqual(2)

  await window.locator('[data-tab-id]', { hasText: '项目A' }).first().click()
  await window.waitForTimeout(700)
  await window.locator(`.react-flow__node[data-id="${seeded.ids[1]}"]`).click({ button: 'right' })
  await window.locator('text=从节点新建标签页').click()
  await window.waitForTimeout(800)
  await expect(window.locator('[data-tab-id]')).toHaveCount(3)
  await expect(window.locator('[data-turn-id]').first()).toContainText('第二问')
  await expect(window.locator('textarea').first()).toBeEnabled()

  await expect(window.locator('[data-selected="true"]')).toHaveCount(0)
  await window
    .locator(`.react-flow__node[data-id="${seeded.ids[0]}"]`)
    .click({ modifiers: ['Control'] })
  await window
    .locator(`.react-flow__node[data-id="${seeded.ids[1]}"]`)
    .click({ modifiers: ['Control'] })
  await expect(window.locator('[data-selected="true"]')).toHaveCount(2)
  await window
    .locator(`.react-flow__node[data-id="${seeded.ids[1]}"]`)
    .click({ modifiers: ['Shift'] })
  await expect(window.locator('[data-selected="true"]')).toHaveCount(1)

  const paneBox = await window.locator('.react-flow__pane').boundingBox()
  if (!paneBox) throw new Error('未找到画布')
  await window.mouse.click(paneBox.x + 15, paneBox.y + paneBox.height - 15)
  await expect(window.locator('[data-selected="true"]')).toHaveCount(0)

  await window.click('button[title^="选择模式"]')
  const boxA = await window.locator(`.react-flow__node[data-id="${seeded.ids[0]}"]`).boundingBox()
  const boxB = await window.locator(`.react-flow__node[data-id="${seeded.ids[1]}"]`).boundingBox()
  if (!boxA || !boxB) throw new Error('未找到节点')
  const startX = Math.max(paneBox.x + 8, Math.min(boxA.x, boxB.x) - 30)
  const startY = Math.max(paneBox.y + 8, Math.min(boxA.y, boxB.y) - 30)
  await window.mouse.move(startX, startY)
  await window.mouse.down()
  await window.mouse.move(
    Math.max(boxA.x + boxA.width, boxB.x + boxB.width) + 30,
    Math.max(boxA.y + boxA.height, boxB.y + boxB.height) + 30,
    { steps: 10 }
  )
  await window.mouse.up()
  await window.waitForTimeout(300)
  await expect(window.locator('[data-selected="true"]')).toHaveCount(2)
  await window.click('button[title^="退出选择模式"]')

  await app.close()
})
