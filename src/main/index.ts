import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { registerIpcHandlers } from './ipc'
import { loadSettings } from './settingsStore'
import { resolveGamePaths, validateGameRoot } from './gameLocation'
import { createPackageFolderProvider } from './providers/packageFolder'
import { createGitHubReleaseCatalogProvider } from './providers/githubReleaseCatalog'

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 720,
    height: 560,
    minWidth: 560,
    minHeight: 420,
    center: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => window.show())

  // Open external links in the user's browser, never inside the app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void window.loadURL(devUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Phase 2 launch diagnostic: prove both sources can be read on startup. This is
 * a temporary, dev-only console probe — Phase 3 replaces it with the resolver
 * and the `refresh` IPC that feeds the renderer.
 */
const logSourceScan = async (): Promise<void> => {
  const { gameRootPath } = await loadSettings()
  if (!gameRootPath || !(await validateGameRoot(gameRootPath)).ok) return

  const paths = resolveGamePaths(gameRootPath)
  const installed = await createPackageFolderProvider(paths).list()
  console.log(`[findias] installed managed mods on disk: ${installed.length}`)

  try {
    const catalog = await createGitHubReleaseCatalogProvider().getCatalog()
    console.log(`[findias] managed mods in latest Uiscias release: ${catalog.length}`)
  } catch (error) {
    console.warn('[findias] catalog fetch failed:', error instanceof Error ? error.message : error)
  }
}

void app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  if (!app.isPackaged) void logSourceScan()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
