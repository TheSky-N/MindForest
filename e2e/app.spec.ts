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
              choices: [{ message: { role: 'assistant', content: '标题：测试主题\n\n摘要：模拟摘要' } }]
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
      return {
        projectId: project.id,
        firstId: first.node.id,
        nodeCount: nodes.length,
        firstParent: firstNode ? firstNode.parentId : 'missing',
        statuses: nodes.map((node) => node.assistantStatus)
      }
    },
    { port: mockPort }
  )

  expect(result.nodeCount).toBe(2)
  expect(result.firstParent).toBeNull()
  expect(result.statuses).toEqual(['complete', 'complete'])

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
