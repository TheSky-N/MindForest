import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { closeDatabase, initDatabase } from './db'
import { createNodeRepository } from './db/repositories/nodes'
import { createSettingsRepository } from './db/repositories/settings'
import {
  migrateLegacyData,
  needsLegacyMigration,
  renameLegacyTables
} from './migration/legacyV1'
import { registerIpcHandlers } from './ipc'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'MindForest',
    backgroundColor: '#020617',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.mindforest.app')
  Menu.setApplicationMenu(null)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  try {
    const handle = initDatabase()
    const { db } = handle
    createNodeRepository(db).failStaleStreaming()

    if (needsLegacyMigration(db)) {
      const backupPath = join(app.getPath('userData'), `mindforest.db.bak-${Date.now()}`)
      await handle.sqlite.backup(backupPath)
      const report = migrateLegacyData(db, backupPath)
      renameLegacyTables(handle.sqlite)
      createSettingsRepository(db).set('migration.v2.report', JSON.stringify(report))
    }

    registerIpcHandlers({ db })
  } catch (error) {
    dialog.showErrorBox(
      'MindForest 启动失败',
      error instanceof Error ? error.message : String(error)
    )
    app.quit()
    return
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  closeDatabase()
})
