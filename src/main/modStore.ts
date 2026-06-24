import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { GamePaths } from '../shared/api';
import { parseManagedModFileName } from '../shared/modFilename';

/**
 * Physical, invariant disk operations on managed `.it` files. This never changes
 * regardless of how installed state is *tracked* — the game always loads `.it`
 * files from the root of `package`, so the files must physically live there.
 * See docs/architecture.md ("Separation of physical store vs. installed-state").
 */
export interface ModStore {
  /**
   * Delete every managed file for `modId` from the package root and the disabled
   * subfolder, optionally keeping one file by name (used by update's
   * write-new-then-delete-old replace to preserve the freshly written version).
   */
  removeManaged(modId: string, exceptFileName?: string): Promise<void>;
  /**
   * Move a mod's managed file(s) between the package root and `package/disabled`.
   * Disabling lazily creates the `disabled` folder; enabling moves files back to
   * the root. The `disabled` folder itself is never deleted.
   */
  setDisabled(modId: string, disabled: boolean): Promise<void>;
}

/** Delete managed files for a modId within a single directory. */
const removeFromDir = async (
  dir: string,
  modId: string,
  exceptFileName?: string,
): Promise<void> => {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    names.map(async (name) => {
      if (name === exceptFileName) return;
      const parsed = parseManagedModFileName(name);
      if (parsed?.modId === modId) await fs.rm(join(dir, name), { force: true });
    }),
  );
};

/** Move a modId's managed file(s) from one directory to another. */
const moveManaged = async (fromDir: string, toDir: string, modId: string): Promise<void> => {
  let names: string[];
  try {
    names = await fs.readdir(fromDir);
  } catch {
    return;
  }
  await Promise.all(
    names.map(async (name) => {
      const parsed = parseManagedModFileName(name);
      if (parsed?.modId !== modId) return;
      const target = join(toDir, name);
      // Defensively clear a colliding target so the rename can't fail on Windows.
      await fs.rm(target, { force: true });
      await fs.rename(join(fromDir, name), target);
    }),
  );
};

/** The current `ModStore`: operates directly on the `package` folder on disk. */
export const createPackageModStore = (paths: GamePaths): ModStore => {
  return {
    removeManaged: async (modId: string, exceptFileName?: string): Promise<void> => {
      await Promise.all([
        removeFromDir(paths.packageDir, modId, exceptFileName),
        removeFromDir(paths.disabledDir, modId, exceptFileName),
      ]);
    },

    setDisabled: async (modId: string, disabled: boolean): Promise<void> => {
      if (disabled) {
        // Lazily create the disabled folder on first use; never removed later.
        await fs.mkdir(paths.disabledDir, { recursive: true });
        await moveManaged(paths.packageDir, paths.disabledDir, modId);
      } else {
        await moveManaged(paths.disabledDir, paths.packageDir, modId);
      }
    },
  };
};
