import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import {
  IpcChannels,
  type AppInfo,
  type ChooseFolderResult,
  type SetupState
} from '../shared/api'
import { loadSettings, saveSettings } from './settingsStore'
import { validateGameRoot } from './gameLocation'

/** Resolve the current setup state by re-validating the stored path on disk. */
const computeSetupState = async (): Promise<SetupState> => {
  const { gameRootPath } = await loadSettings()
  if (!gameRootPath) {
    return { gameRootPath: null, valid: false }
  }
  const { ok } = await validateGameRoot(gameRootPath)
  return { gameRootPath, valid: ok }
}

export const registerIpcHandlers = (): void => {
  ipcMain.handle(
    IpcChannels.getAppInfo,
    (): AppInfo => ({
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node
    })
  )

  ipcMain.handle(IpcChannels.getSetupState, () => computeSetupState())

  ipcMain.handle(IpcChannels.chooseGameFolder, async (event): Promise<ChooseFolderResult> => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions = {
      title: 'Select your Mabinogi game folder (appdata)',
      properties: ['openDirectory' as const]
    }

    const result = owner
      ? await dialog.showOpenDialog(owner, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, canceled: true }
    }

    const chosen = result.filePaths[0]
    const validation = await validateGameRoot(chosen)
    if (!validation.ok) {
      return { ok: false, error: validation.error }
    }

    const settings = await loadSettings()
    await saveSettings({ ...settings, gameRootPath: chosen })
    return { ok: true, state: { gameRootPath: chosen, valid: true } }
  })
}
