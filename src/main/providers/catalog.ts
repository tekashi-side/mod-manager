/**
 * Contract for the remote mod catalog — "what mods exist (grouped, with their
 * variants), and how to obtain the bytes." The concrete implementation lives in
 * `manifestCatalog.ts`. The shape mirrors the Uiscias `manifestCatalog.json`
 * 1:1 (every entry is a group; a non-variant mod is a group of one) so the rest
 * of the app never has to flatten and regroup. Consumers depend only on this
 * contract and its normalized types, never on GitHub specifics.
 *
 * See docs/architecture.md ("Source abstraction").
 */

/** One installable artifact (a single mod, or one variant of a group). */
export interface CatalogVariant {
  modId: string;
  modName: string;
  fileName: string;
  version: number;
  size: number;
  /** Freshness class (`stable` | `volatile`); kept as a string for leniency. */
  updateType: string;
  /** Repo-relative game files this variant modifies; drives conflict detection. */
  usedFiles: string[];
  modAuthor: string;
  modAdditionalCredits: string;
  recentUpdateNotes: string;
  /** Opens a byte stream for the mod file, hiding the source URL/transport. */
  fetchBytes(): Promise<ReadableStream<Uint8Array>>;
}

/** A catalog group: a single mod (one variant) or a mutually-exclusive variant set. */
export interface CatalogGroup {
  groupId: string;
  modName: string;
  findiasTags: string[];
  hasVariants: boolean;
  mutuallyExclusive: boolean;
  variants: CatalogVariant[];
}

/** Catalog-wide metadata read from the manifest's `metadata` block. */
export interface CatalogMetadata {
  schemaVersion: number;
  currentGameVersion: string;
  supportedGameVersion: string;
  generatedAt: string;
}

/** The full normalized catalog returned by the provider. */
export interface Catalog {
  metadata: CatalogMetadata;
  groups: CatalogGroup[];
}

/**
 * Source-agnostic remote catalog. Kept as a one-implementation interface purely
 * so tests can inject a stubbed `fetch`. `includePrereleases` controls whether
 * prerelease GitHub releases are eligible when selecting the newest one.
 */
export interface ModCatalogProvider {
  getCatalog(includePrereleases: boolean): Promise<Catalog>;
}

export type CatalogErrorCode = 'network' | 'rate-limited' | 'http' | 'parse' | 'not-found';

/**
 * Typed failure thrown by the catalog implementation, so the UI can show an
 * appropriate, recoverable message regardless of the underlying source.
 */
export class CatalogError extends Error {
  readonly code: CatalogErrorCode;

  constructor(code: CatalogErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CatalogError';
    this.code = code;
  }
}
