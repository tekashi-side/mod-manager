/**
 * Contract for the remote mod catalog — "what mods exist, their versions, and how
 * to obtain the bytes." Concrete implementations live in their own files (e.g.
 * `githubReleaseCatalog.ts`); a future source would be added as a new file
 * implementing this same interface. Consumers depend only on this contract and
 * the normalized `CatalogEntry` shape, never on a specific source.
 *
 * See docs/architecture.md ("Source abstraction").
 */

/**
 * Normalized catalog entry, with no leak of the underlying source. Consumers
 * depend on this shape, not on the specifics of GitHub (or any future source).
 */
export interface CatalogEntry {
  modId: string
  version: number
  fileName: string
  size?: number
  /** Opens a byte stream for the mod file, hiding the source URL/transport. */
  fetchBytes(): Promise<ReadableStream<Uint8Array>>
}

/** Source-agnostic remote catalog. */
export interface ModCatalogProvider {
  getCatalog(): Promise<CatalogEntry[]>
}

export type CatalogErrorCode = 'network' | 'rate-limited' | 'http' | 'parse'

/**
 * Typed failure thrown by any catalog implementation, so the UI can show an
 * appropriate, recoverable message regardless of the underlying source.
 */
export class CatalogError extends Error {
  readonly code: CatalogErrorCode

  constructor(code: CatalogErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CatalogError'
    this.code = code
  }
}
