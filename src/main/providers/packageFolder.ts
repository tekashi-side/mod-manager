import { type Dirent, promises as fs } from 'node:fs'
import type { GamePaths } from '../../shared/api'
import { parseManagedModFileName } from '../../shared/modFilename'
import type { InstalledMod, InstalledModsProvider } from './installed'

/** Read a directory's entries, treating a missing directory as empty. */
const readDirSafe = async (dir: string): Promise<Dirent[]> => {
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch {
    // A missing folder (e.g. no package/disabled yet) is a normal empty result.
    return []
  }
}

/** Parse the managed `.it` files in a single directory into `InstalledMod[]`. */
const listManagedInDir = async (dir: string, enabled: boolean): Promise<InstalledMod[]> => {
  const mods: InstalledMod[] = []
  for (const entry of await readDirSafe(dir)) {
    if (!entry.isFile()) continue
    const parsed = parseManagedModFileName(entry.name)
    if (!parsed) continue
    mods.push({
      modId: parsed.modId,
      version: parsed.version,
      fileName: parsed.fileName,
      enabled
    })
  }
  return mods
}

/**
 * Current `InstalledModsProvider`: the package folder *is* the record. Managed
 * `.it` files in the root of `package` are enabled; those in `package/disabled`
 * are disabled. Everything that is not a managed mod (official `data_*.it`,
 * third-party mods, stray files, the `disabled` folder itself) is ignored and
 * never touched. Swappable for an `installedMods.json` strategy by adding a
 * sibling file that implements the same interface — no consumer changes.
 */
export const createPackageFolderProvider = (paths: GamePaths): InstalledModsProvider => {
  return {
    list: async (): Promise<InstalledMod[]> => {
      const [enabled, disabled] = await Promise.all([
        listManagedInDir(paths.packageDir, true),
        listManagedInDir(paths.disabledDir, false)
      ])
      return [...enabled, ...disabled]
    }
  }
}
