import type { ModRow } from '../shared/modList'
import type { CatalogEntry } from './providers/catalog'
import type { InstalledMod } from './providers/installed'

/**
 * The resolver merges the two normalized sources — it depends only on their
 * interfaces, never on GitHub or filesystem specifics. See docs/architecture.md
 * ("Mod resolution").
 */

interface InstalledGroup {
  /** Highest-version enabled file for a modId (in package root), if any. */
  enabled?: InstalledMod
  /** Highest-version disabled file for a modId (in package/disabled), if any. */
  disabled?: InstalledMod
}

/**
 * Group installed files by modId, keeping the highest version seen for the
 * enabled and disabled locations separately. Duplicates (from a crashed update
 * or manual tinkering) collapse to the newest of each; the next mutation
 * reconciles the rest.
 */
const groupInstalledByModId = (installed: InstalledMod[]): Map<string, InstalledGroup> => {
  const groups = new Map<string, InstalledGroup>()
  for (const mod of installed) {
    const group = groups.get(mod.modId) ?? {}
    if (mod.enabled) {
      if (!group.enabled || mod.version > group.enabled.version) group.enabled = mod
    } else if (!group.disabled || mod.version > group.disabled.version) {
      group.disabled = mod
    }
    groups.set(mod.modId, group)
  }
  return groups
}

/** Compute the row (status + valid actions) for a single modId. */
const buildRow = (
  modId: string,
  release: CatalogEntry | undefined,
  group: InstalledGroup | undefined
): ModRow => {
  const enabled = group?.enabled
  const disabled = group?.disabled
  const primary = enabled ?? disabled
  const size = release?.size ?? null

  // Installed (or partially so) but absent from the current release.
  if (!release) {
    return {
      modId,
      name: modId,
      status: 'orphan',
      releaseVersion: null,
      installedVersion: primary?.version ?? null,
      size: null,
      actions: ['delete']
    }
  }

  // In the release but nothing on disk.
  if (!primary) {
    return {
      modId,
      name: modId,
      status: 'not-installed',
      releaseVersion: release.version,
      installedVersion: null,
      size,
      actions: ['install']
    }
  }

  // In the release and present only in package/disabled.
  if (!enabled && disabled) {
    const stale = disabled.version < release.version
    return {
      modId,
      name: modId,
      status: 'disabled',
      releaseVersion: release.version,
      installedVersion: disabled.version,
      size,
      actions: stale ? ['enable', 'update', 'delete'] : ['enable', 'delete']
    }
  }

  // In the release and enabled on disk.
  const installedVersion = primary.version
  if (installedVersion < release.version) {
    return {
      modId,
      name: modId,
      status: 'update-available',
      releaseVersion: release.version,
      installedVersion,
      size,
      actions: ['update', 'disable', 'delete']
    }
  }
  return {
    modId,
    name: modId,
    status: 'up-to-date',
    releaseVersion: release.version,
    installedVersion,
    size,
    actions: ['disable', 'delete']
  }
}

/**
 * Merge the release catalog and the installed-mods scan into the rows the UI
 * renders, keyed by modId and sorted by name. Pure and deterministic — the same
 * inputs always produce the same output.
 */
export const resolveModList = (catalog: CatalogEntry[], installed: InstalledMod[]): ModRow[] => {
  const catalogById = new Map(catalog.map((entry) => [entry.modId, entry]))
  const installedById = groupInstalledByModId(installed)

  const modIds = new Set<string>([...catalogById.keys(), ...installedById.keys()])
  const rows: ModRow[] = []
  for (const modId of modIds) {
    rows.push(buildRow(modId, catalogById.get(modId), installedById.get(modId)))
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}
