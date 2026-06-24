import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { GamePaths } from '../shared/api';

/** The game's loaded-content folder; only `.it` files in its root are loaded. */
export const PACKAGE_DIR_NAME = 'package';

/** Subfolder of `package` used to hold temporarily disabled mods. */
export const DISABLED_DIR_NAME = 'disabled';

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** Derive the package + disabled paths from a chosen game root (`appdata`). */
export const resolveGamePaths = (root: string): GamePaths => {
  const packageDir = join(root, PACKAGE_DIR_NAME);
  return {
    root,
    packageDir,
    disabledDir: join(packageDir, DISABLED_DIR_NAME),
  };
};

const isDirectory = async (path: string): Promise<boolean> => {
  try {
    return (await fs.stat(path)).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Validate that a folder is a usable Mabinogi game root. The defining marker is
 * a `package` subfolder (where the game loads `.it` files from). We deliberately
 * do not require the folder to be named `appdata`, since installs vary.
 */
export const validateGameRoot = async (root: string): Promise<ValidationResult> => {
  if (!root) {
    return { ok: false, error: 'No folder was selected.' };
  }
  if (!(await isDirectory(root))) {
    return { ok: false, error: 'The selected folder no longer exists.' };
  }
  if (!(await isDirectory(resolveGamePaths(root).packageDir))) {
    return {
      ok: false,
      error:
        'This does not look like a Mabinogi game folder — no "package" subfolder was found inside it.',
    };
  }
  return { ok: true };
};
