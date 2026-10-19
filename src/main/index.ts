import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { closeDatabase, initDatabase } from './db'
import { createNodeRepository } from './db/repositories/nodes'
import { createSettingsRepository } from './db/repositories/settings'
import type { SettingsRepository } from './db/repositories/settings'
import { migrateLegacyData, needsLegacyMigration, renameLegacyTables } from './migration/legacyV1'
import { registerIpcHandlers } from './ipc'
import { autoBackup } from './backup/backupService'
import { attachWindowStatePersistence, loadWindowState } from './windowState'

let mainWindow: BrowserWindow | null = null

const QUIT_ON_SECOND_INSTANCE = app.requestSingleInstanceLock()
if (!QUIT_ON_SECOND_INSTANCE) {
  app.quit()
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

function createWindow(settings: SettingsRepository): void {
  const state = loadWindowState(settings)
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
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

  attachWindowStatePersistence(settings, mainWindow)

  const reveal = (): void => {
    if (!mainWindow) return
    if (state.maximized) mainWindow.maximize()
    if (!mainWindow.isVisible()) mainWindow.show()
  }

  mainWindow.once('ready-to-show', reveal)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const loaded =
    is.dev && process.env['ELECTRON_RENDERER_URL']
      ? mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
      : mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))

  // `ready-to-show` can be missed on some Linux/Electron combinations; reveal after load too.
  void loaded.then(reveal).catch(() => undefined)
}

if (QUIT_ON_SECOND_INSTANCE) {
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

      const settings = createSettingsRepository(db)
      registerIpcHandlers({ db, settings })

      void autoBackup(handle.sqlite, join(app.getPath('userData'), 'backups')).catch(
        () => undefined
      )

      createWindow(settings)
    } catch (error) {
      dialog.showErrorBox(
        'MindForest 启动失败',
        error instanceof Error ? error.message : String(error)
      )
      app.quit()
      return
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const handle = initDatabase()
        createWindow(createSettingsRepository(handle.db))
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    closeDatabase()
  })
}
