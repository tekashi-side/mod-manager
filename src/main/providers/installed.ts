/**
 * Contract for the local installed-mods source — "what is installed, and how we
 * record changes to that record." Concrete implementations live in their own
 * files (e.g. `packageFolder.ts`); a future source (e.g. an `installedMods.json`)
 * would be added as a new file implementing this same interface. Consumers depend
 * only on this contract and the normalized `InstalledMod` shape.
 *
 * See docs/architecture.md ("Source abstraction").
 */

/**
 * Normalized record of an installed mod, independent of how it was discovered.
 * The rest of the system depends on this shape — never on filesystem specifics —
 * so the discovery strategy can be swapped without downstream changes.
 */
export interface InstalledMod {
  modId: string
  version: number
  fileName: string
  /** false = the file currently lives in `package/disabled`. */
  enabled: boolean
  /** Only populated by sources that record it (e.g. a future installedMods.json). */
  updatedAt?: string
}

/**
 * Source-agnostic view of what is installed locally. The optional lifecycle hooks
 * let a stateful implementation record changes; for a pure folder scan the folder
 * *is* the record, so they are simply not implemented.
 */
export interface InstalledModsProvider {
  list(): Promise<InstalledMod[]>
  onInstalled?(mod: InstalledMod): Promise<void>
  onRemoved?(modId: string): Promise<void>
}
