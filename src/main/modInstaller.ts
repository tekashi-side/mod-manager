import { downloadToFile } from './downloader';
import type { ModStore } from './modStore';
import type { CatalogVariant } from './providers/catalog';

export interface InstallParams {
  /** The variant to install (its `fileName` is the canonical target name). */
  entry: CatalogVariant;
  /** Physical store used to remove superseded versions after the write. */
  store: ModStore;
  /** The package root the file is written into. */
  packageDir: string;
  /**
   * Other variants' modIds to remove after a successful write (a mutually
   * exclusive group's siblings). Switching variants is a single action: install
   * the chosen one, then remove the previously-installed sibling.
   */
  replaceSiblings?: string[];
  /** Cumulative bytes-written callback for progress reporting. */
  onProgress?: (receivedBytes: number) => void;
}

/**
 * Install or update a mod with **replace** semantics: download the release
 * version into the package root (temp file → atomic rename), then remove every
 * other managed file for the same modId (older versions in the root, any copy in
 * `disabled`) and any installed siblings (variant switch). Writing the new file
 * before deleting the old means a crash never leaves the mod missing — at worst
 * extra files remain, which the next refresh reconciles. See
 * docs/architecture.md ("Update" / "Install").
 */
export const installOrUpdateMod = async (params: InstallParams): Promise<void> => {
  await downloadToFile({
    openStream: () => params.entry.fetchBytes(),
    destinationDir: params.packageDir,
    fileName: params.entry.fileName,
    onProgress: params.onProgress,
  });
  await params.store.removeManaged(params.entry.modId, params.entry.fileName);
  await Promise.all(
    (params.replaceSiblings ?? []).map((siblingModId) => params.store.removeManaged(siblingModId)),
  );
};
