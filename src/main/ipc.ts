import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  IpcChannels,
  type AppInfo,
  type ChooseFolderResult,
  type DownloadProgress,
  type GamePaths,
  type SetupState,
} from '../shared/api';
import type { ModListState } from '../shared/modList';
import { loadSettings, saveSettings } from './settingsStore';
import { resolveGamePaths, validateGameRoot, type ValidationResult } from './gameLocation';
import { resolveModList } from './modResolver';
import { installOrUpdateMod } from './modInstaller';
import { createPackageModStore } from './modStore';
import { CatalogError, type Catalog } from './providers/catalog';
import { createManifestCatalogProvider } from './providers/manifestCatalog';
import { createPackageFolderProvider } from './providers/packageFolder';

/** Resolve the current setup state by re-validating the stored path on disk. */
const computeSetupState = async (): Promise<SetupState> => {
  const { gameRootPath, includePrereleases } = await loadSettings();
  if (!gameRootPath) {
    return { gameRootPath: null, valid: false, includePrereleases };
  }
  const { ok } = await validateGameRoot(gameRootPath);
  return { gameRootPath, valid: ok, includePrereleases };
};

/** Resolve the stored game paths, throwing a clear error if setup is invalid. */
const requireGamePaths = async (): Promise<GamePaths> => {
  const { gameRootPath } = await loadSettings();
  const validation: ValidationResult = gameRootPath
    ? await validateGameRoot(gameRootPath)
    : { ok: false, error: 'No game folder is configured.' };

  if (!gameRootPath || !validation.ok) {
    throw new Error(validation.error ?? 'No game folder is configured.');
  }
  return resolveGamePaths(gameRootPath);
};

/**
 * Build the current mod list: scan the package folder + fetch the catalog, then
 * resolve. A catalog failure (offline, rate-limited, no manifest) degrades
 * softly — installed mods are still returned (as orphans) so the user can manage
 * them, and the failure is reported via `catalog.available`.
 */
const resolveCurrentState = async (paths: GamePaths): Promise<ModListState> => {
  const { includePrereleases } = await loadSettings();
  const installed = await createPackageFolderProvider(paths).list();
  try {
    const catalog = await createManifestCatalogProvider().getCatalog(includePrereleases);
    const { groups, metadata } = resolveModList(catalog, installed);
    return { groups, catalog: { available: true }, metadata };
  } catch (error) {
    const message =
      error instanceof CatalogError ? error.message : 'Could not load the mod catalog.';
    const { groups, metadata } = resolveModList(null, installed);
    return { groups, catalog: { available: false, error: message }, metadata };
  }
};

const refresh = async (): Promise<ModListState> => resolveCurrentState(await requireGamePaths());

/** Locate a variant + its group in the catalog by modId. */
const findVariant = (
  catalog: Catalog,
  modId: string,
): {
  group: Catalog['groups'][number];
  variant: Catalog['groups'][number]['variants'][number];
} | null => {
  for (const group of catalog.groups) {
    const variant = group.variants.find((candidate) => candidate.modId === modId);
    if (variant) return { group, variant };
  }
  return null;
};

/**
 * Install or replace a mod, then return the fresh mod list. The catalog is
 * fetched once and reused for both the lookup and the post-mutation resolve. For
 * a mutually-exclusive variant group, the chosen variant replaces any installed
 * sibling (auto-switch). Download progress is streamed to the calling renderer.
 */
const installOrUpdate = async (event: IpcMainInvokeEvent, modId: string): Promise<ModListState> => {
  const paths = await requireGamePaths();
  const { includePrereleases } = await loadSettings();
  const catalog = await createManifestCatalogProvider().getCatalog(includePrereleases);
  const found = findVariant(catalog, modId);
  if (!found) {
    throw new Error(`"${modId}" is not available in the latest release.`);
  }

  const { group, variant } = found;
  const replaceSiblings = group.mutuallyExclusive
    ? group.variants
        .filter((candidate) => candidate.modId !== modId)
        .map((candidate) => candidate.modId)
    : [];

  await installOrUpdateMod({
    entry: variant,
    store: createPackageModStore(paths),
    packageDir: paths.packageDir,
    replaceSiblings,
    onProgress: (receivedBytes) => {
      const progress: DownloadProgress = { modId, receivedBytes, totalBytes: variant.size };
      event.sender.send(IpcChannels.downloadProgress, progress);
    },
  });

  const installed = await createPackageFolderProvider(paths).list();
  const { groups, metadata } = resolveModList(catalog, installed);
  return { groups, catalog: { available: true }, metadata };
};

/** Delete every managed file for a mod, then return the fresh mod list. */
const deleteMod = async (modId: string): Promise<ModListState> => {
  const paths = await requireGamePaths();
  await createPackageModStore(paths).removeManaged(modId);
  return resolveCurrentState(paths);
};

/** Move a mod in/out of `package/disabled`, then return the fresh mod list. */
const setDisabled = async (modId: string, disabled: boolean): Promise<ModListState> => {
  const paths = await requireGamePaths();
  await createPackageModStore(paths).setDisabled(modId, disabled);
  return resolveCurrentState(paths);
};

/** Persist the prerelease preference, then re-resolve against the new filter. */
const setIncludePrereleases = async (value: boolean): Promise<ModListState> => {
  const settings = await loadSettings();
  await saveSettings({ ...settings, includePrereleases: value });
  return resolveCurrentState(await requireGamePaths());
};

export const registerIpcHandlers = (): void => {
  ipcMain.handle(
    IpcChannels.getAppInfo,
    (): AppInfo => ({
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
    }),
  );

  ipcMain.handle(IpcChannels.getSetupState, () => computeSetupState());

  ipcMain.handle(IpcChannels.refresh, () => refresh());

  ipcMain.handle(IpcChannels.installOrUpdate, (event, modId: string) =>
    installOrUpdate(event, modId),
  );

  ipcMain.handle(IpcChannels.deleteMod, (_event, modId: string) => deleteMod(modId));

  ipcMain.handle(IpcChannels.setDisabled, (_event, modId: string, disabled: boolean) =>
    setDisabled(modId, disabled),
  );

  ipcMain.handle(IpcChannels.setIncludePrereleases, (_event, value: boolean) =>
    setIncludePrereleases(value),
  );

  ipcMain.handle(IpcChannels.chooseGameFolder, async (event): Promise<ChooseFolderResult> => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = {
      title: 'Select your Mabinogi game folder (appdata)',
      properties: ['openDirectory' as const],
    };

    const result = owner
      ? await dialog.showOpenDialog(owner, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    const chosen = result.filePaths[0];
    const validation = await validateGameRoot(chosen);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    const settings = await loadSettings();
    await saveSettings({ ...settings, gameRootPath: chosen });
    return {
      ok: true,
      state: { gameRootPath: chosen, valid: true, includePrereleases: settings.includePrereleases },
    };
  });
};
