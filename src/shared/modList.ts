/**
 * DTOs that cross the IPC boundary to describe the rendered mod list. These are
 * the normalized, serializable view models the renderer consumes — derived in
 * the main process by the resolver from the catalog + installed sources. They
 * intentionally carry no GitHub- or filesystem-specific detail.
 */

/** Per-mod status, computed by merging the release catalog with what is on disk. */
export type ModStatus =
  | 'not-installed' // in the release, not on disk
  | 'up-to-date' // installed (enabled) at >= the release version
  | 'update-available' // installed (enabled) at an older version than the release
  | 'disabled' // present only in package/disabled
  | 'orphan'; // installed but absent from the current release

/** An action the user may take on a row. Mutations are wired in later phases. */
export type ModAction = 'install' | 'update' | 'enable' | 'disable' | 'delete';

/** A single rendered row in the mod list. */
export interface ModRow {
  /** Stable identity (the `<ModFileName>` segment). */
  modId: string;
  /** Display name; currently the same as `modId`. */
  name: string;
  status: ModStatus;
  /** Version offered by the latest release, or null if absent from it (orphan). */
  releaseVersion: number | null;
  /** Version currently on disk, or null if not installed. */
  installedVersion: number | null;
  /** Release asset size in bytes, when known. */
  size: number | null;
  /** Valid actions for this row, in display order. */
  actions: ModAction[];
}

/** Status of the remote catalog fetch for the current refresh. */
export interface CatalogStatus {
  /** False when the catalog could not be loaded (offline, rate-limited, etc.). */
  available: boolean;
  /** User-facing explanation when `available` is false. */
  error?: string;
}

/**
 * The full result of a refresh: the rendered rows plus whether the remote catalog
 * was reachable. When the catalog is unavailable, rows still reflect what is
 * installed on disk (all as orphans) so the user can manage existing mods.
 */
export interface ModListState {
  rows: ModRow[];
  catalog: CatalogStatus;
}
