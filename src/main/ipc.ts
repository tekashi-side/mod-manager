import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  IpcChannels,
  type AppInfo,
  type ChooseFolderResult,
  type DownloadProgress,
  type GamePaths,
  type SetupState
} from '../shared/api'
import type { ModListState } from '../shared/modList'
import { loadSettings, saveSettings } from './settingsStore'
import { resolveGamePaths, validateGameRoot, type ValidationResult } from './gameLocation'
import { resolveModList } from './modResolver'
import { installOrUpdateMod } from './modInstaller'
import { createPackageModStore } from './modStore'
import { CatalogError } from './providers/catalog'
import { createGitHubReleaseCatalogProvider } from './providers/githubReleaseCatalog'
import { createPackageFolderProvider } from './providers/packageFolder'

/** Resolve the current setup state by re-validating the stored path on disk. */
const computeSetupState = async (): Promise<SetupState> => {
  const { gameRootPath } = await loadSettings()
  if (!gameRootPath) {
    return { gameRootPath: null, valid: false }
  }
  const { ok } = await validateGameRoot(gameRootPath)
  return { gameRootPath, valid: ok }
}

/** Resolve the stored game paths, throwing a clear error if setup is invalid. */
const requireGamePaths = async (): Promise<GamePaths> => {
  const { gameRootPath } = await loadSettings()
  const validation: ValidationResult = gameRootPath
    ? await validateGameRoot(gameRootPath)
    : { ok: false, error: 'No game folder is configured.' }

  if (!gameRootPath || !validation.ok) {
    throw new Error(validation.error ?? 'No game folder is configured.')
  }
  return resolveGamePaths(gameRootPath)
}

/**
 * Build the current mod list: scan the package folder + fetch the catalog, then
 * resolve. A catalog failure (offline, rate-limited) degrades softly — installed
 * mods are still returned (as orphans) so the user can manage them, and the
 * failure is reported via `catalog.available`.
 */
const resolveCurrentState = async (paths: GamePaths): Promise<ModListState> => {
  const installed = await createPackageFolderProvider(paths).list()
  try {
    const catalog = await createGitHubReleaseCatalogProvider().getCatalog()
    return { rows: resolveModList(catalog, installed), catalog: { available: true } }
  } catch (error) {
    const message =
      error instanceof CatalogError ? error.message : 'Could not load the mod catalog.'
    return { rows: resolveModList([], installed), catalog: { available: false, error: message } }
  }
}

const refresh = async (): Promise<ModListState> => resolveCurrentState(await requireGamePaths())

/**
 * Install or replace a mod, then return the fresh mod list. The catalog is
 * fetched once and reused for both the entry lookup and the post-mutation
 * resolve, avoiding a second GitHub request. Download progress is streamed to
 * the calling renderer over the progress channel.
 */
const installOrUpdate = async (
  event: IpcMainInvokeEvent,
  modId: string
): Promise<ModListState> => {
  const paths = await requireGamePaths()
  const catalog = await createGitHubReleaseCatalogProvider().getCatalog()
  const entry = catalog.find((candidate) => candidate.modId === modId)
  if (!entry) {
    throw new Error(`"${modId}" is not available in the latest release.`)
  }

  await installOrUpdateMod({
    entry,
    store: createPackageModStore(paths),
    packageDir: paths.packageDir,
    onProgress: (receivedBytes) => {
      const progress: DownloadProgress = { modId, receivedBytes, totalBytes: entry.size ?? null }
      event.sender.send(IpcChannels.downloadProgress, progress)
    }
  })

  const installed = await createPackageFolderProvider(paths).list()
  return { rows: resolveModList(catalog, installed), catalog: { available: true } }
}

/** Delete every managed file for a mod, then return the fresh mod list. */
const deleteMod = async (modId: string): Promise<ModListState> => {
  const paths = await requireGamePaths()
  await createPackageModStore(paths).removeManaged(modId)
  return resolveCurrentState(paths)
}

/** Move a mod in/out of `package/disabled`, then return the fresh mod list. */
const setDisabled = async (modId: string, disabled: boolean): Promise<ModListState> => {
  const paths = await requireGamePaths()
  await createPackageModStore(paths).setDisabled(modId, disabled)
  return resolveCurrentState(paths)
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

  ipcMain.handle(IpcChannels.refresh, () => refresh())

  ipcMain.handle(IpcChannels.installOrUpdate, (event, modId: string) =>
    installOrUpdate(event, modId)
  )

  ipcMain.handle(IpcChannels.deleteMod, (_event, modId: string) => deleteMod(modId))

  ipcMain.handle(IpcChannels.setDisabled, (_event, modId: string, disabled: boolean) =>
    setDisabled(modId, disabled)
  )

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
