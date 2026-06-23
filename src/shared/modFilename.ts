/**
 * Shared parser for the Findias-managed mod filename grammar:
 *
 *   uiscias<ModFileName>_<number>.it
 *
 * Used by both the local package scanner and the remote catalog provider so
 * on-disk files and release assets are interpreted identically. The match is
 * case-insensitive on the prefix/extension; `modId` preserves the original case
 * of the `<ModFileName>` segment.
 *
 * See docs/architecture.md ("Filename grammar and mod identity").
 */

export interface ParsedMod {
  /** Exact file name as seen on disk or as a release asset. */
  fileName: string
  /** Stable identity = the `<ModFileName>` segment. */
  modId: string
  /** Version = the trailing number, parsed as an integer for comparison. */
  version: number
}

const MANAGED = /^uiscias(?<name>[^_]+)_(?<version>\d{1,5})\.it$/i

/**
 * Parse a managed mod file name. Returns `null` for anything that is not a
 * Findias-managed mod (official game files, third-party mods, stray files),
 * which callers should skip rather than treat as an error.
 */
export const parseManagedModFileName = (fileName: string): ParsedMod | null => {
  const match = MANAGED.exec(fileName)
  if (!match?.groups) return null
  return {
    fileName,
    modId: match.groups.name,
    version: Number.parseInt(match.groups.version, 10)
  }
}

/** Build the canonical managed file name for a given mod id + version. */
export const buildManagedModFileName = (modId: string, version: number): string => {
  return `uiscias${modId}_${version}.it`
}
