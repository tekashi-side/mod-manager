/**
 * Shared IPC contract types. Imported by main, preload, and renderer so all
 * three processes agree on the shape of the bridge exposed on `window.findias`.
 */

import type { ModListState } from './modList';

export interface AppInfo {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
}

/** Resolved game-folder paths derived from the chosen root. */
export interface GamePaths {
  root: string;
  packageDir: string;
  disabledDir: string;
}

/**
 * Whether Findias is ready to operate. The app is gated until a game folder is
 * both chosen and still valid (its `package` subfolder exists).
 */
export interface SetupState {
  gameRootPath: string | null;
  valid: boolean;
  /** Whether prerelease Uiscias releases are considered when fetching the catalog. */
  includePrereleases: boolean;
}

/** Result of prompting the user to choose a game folder. */
export interface ChooseFolderResult {
  ok: boolean;
  /** True when the user dismissed the native dialog. */
  canceled?: boolean;
  /** Present when validation failed (e.g. no `package` subfolder). */
  error?: string;
  /** Present on success — the new setup state. */
  state?: SetupState;
}

/** Progress event emitted while a mod is downloading. */
export interface DownloadProgress {
  modId: string;
  receivedBytes: number;
  /** Expected total from the release asset size, or null when unknown. */
  totalBytes: number | null;
}

/** The allow-listed surface exposed to the renderer via contextBridge. */
export interface FindiasApi {
  getAppInfo(): Promise<AppInfo>;
  getSetupState(): Promise<SetupState>;
  chooseGameFolder(): Promise<ChooseFolderResult>;
  /** Scan the package folder, fetch the catalog, and resolve the mod list. */
  refresh(): Promise<ModListState>;
  /** Install (or replace with) the latest release version of a mod. */
  installOrUpdate(modId: string): Promise<ModListState>;
  /** Delete every managed file for a mod (package root + disabled). */
  deleteMod(modId: string): Promise<ModListState>;
  /** Move a mod between the package root and `package/disabled`. */
  setDisabled(modId: string, disabled: boolean): Promise<ModListState>;
  /** Persist whether prereleases are eligible, then re-resolve the mod list. */
  setIncludePrereleases(value: boolean): Promise<ModListState>;
  /** Subscribe to download progress; returns an unsubscribe function. */
  onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void;
}

/** IPC channel names, kept in one place to avoid string drift across processes. */
export const IpcChannels = {
  getAppInfo: 'app:getInfo',
  getSetupState: 'setup:getState',
  chooseGameFolder: 'setup:chooseGameFolder',
  refresh: 'mods:refresh',
  installOrUpdate: 'mods:installOrUpdate',
  deleteMod: 'mods:delete',
  setDisabled: 'mods:setDisabled',
  setIncludePrereleases: 'settings:setIncludePrereleases',
  downloadProgress: 'mods:downloadProgress',
} as const;
