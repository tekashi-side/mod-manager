/**
 * Shared IPC contract types. Imported by main, preload, and renderer so all
 * three processes agree on the shape of the bridge exposed on `window.findias`.
 */

export interface AppInfo {
  appVersion: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
}

/** Resolved game-folder paths derived from the chosen root. */
export interface GamePaths {
  root: string
  packageDir: string
  disabledDir: string
}

/**
 * Whether Findias is ready to operate. The app is gated until a game folder is
 * both chosen and still valid (its `package` subfolder exists).
 */
export interface SetupState {
  gameRootPath: string | null
  valid: boolean
}

/** Result of prompting the user to choose a game folder. */
export interface ChooseFolderResult {
  ok: boolean
  /** True when the user dismissed the native dialog. */
  canceled?: boolean
  /** Present when validation failed (e.g. no `package` subfolder). */
  error?: string
  /** Present on success — the new setup state. */
  state?: SetupState
}

/** The allow-listed surface exposed to the renderer via contextBridge. */
export interface FindiasApi {
  getAppInfo(): Promise<AppInfo>
  getSetupState(): Promise<SetupState>
  chooseGameFolder(): Promise<ChooseFolderResult>
}

/** IPC channel names, kept in one place to avoid string drift across processes. */
export const IpcChannels = {
  getAppInfo: 'app:getInfo',
  getSetupState: 'setup:getState',
  chooseGameFolder: 'setup:chooseGameFolder'
} as const
