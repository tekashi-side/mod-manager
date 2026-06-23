import { z } from 'zod'
import { type ParsedMod, parseManagedModFileName } from '../../shared/modFilename'
import { CatalogError, type CatalogEntry, type ModCatalogProvider } from './catalog'

/** Minimal `fetch` shape we depend on; lets tests inject a stub without casts. */
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

export interface GitHubCatalogOptions {
  owner?: string
  repo?: string
  baseUrl?: string
  fetchFn?: FetchLike
}

const DEFAULT_OWNER = 'Root50199'
const DEFAULT_REPO = 'Uiscias'
const DEFAULT_BASE_URL = 'https://api.github.com'

// GitHub release/asset JSON is untrusted input — validate the fields we consume.
// `assets` is kept as `unknown[]` so a single malformed asset never fails the
// whole release; each asset is validated individually and skipped if invalid.
const assetSchema = z.object({
  name: z.string(),
  size: z.number().optional(),
  browser_download_url: z.string()
})

const releaseSchema = z.object({
  draft: z.boolean().optional(),
  prerelease: z.boolean().optional(),
  assets: z.array(z.unknown()).optional()
})

const releasesSchema = z.array(releaseSchema)

type ValidatedAsset = z.infer<typeof assetSchema>

interface ResolvedOptions {
  owner: string
  repo: string
  baseUrl: string
  fetchFn: FetchLike
}

/** Build a friendly rate-limit message from the `x-ratelimit-reset` header. */
const rateLimitMessage = (resetHeader: string | null): string => {
  const resetSeconds = resetHeader ? Number.parseInt(resetHeader, 10) : Number.NaN
  if (Number.isFinite(resetSeconds)) {
    const minutes = Math.max(1, Math.ceil((resetSeconds * 1000 - Date.now()) / 60_000))
    return `GitHub's hourly rate limit was reached. Try again in about ${minutes} minute(s).`
  }
  return "GitHub's hourly rate limit was reached. Please try again later."
}

/** Build a normalized `CatalogEntry` from a validated asset + its parsed name. */
const makeEntry = (asset: ValidatedAsset, parsed: ParsedMod, fetchFn: FetchLike): CatalogEntry => ({
  modId: parsed.modId,
  version: parsed.version,
  fileName: parsed.fileName,
  size: asset.size,
  fetchBytes: async (): Promise<ReadableStream<Uint8Array>> => {
    const response = await fetchFn(asset.browser_download_url)
    if (!response.ok || !response.body) {
      throw new CatalogError('http', `Failed to download ${parsed.fileName} (HTTP ${response.status}).`)
    }
    return response.body
  }
})

/** Request the repo's releases feed, mapping connection failures to `CatalogError`. */
const fetchReleases = async (options: ResolvedOptions): Promise<Response> => {
  const url = `${options.baseUrl}/repos/${options.owner}/${options.repo}/releases`
  try {
    return await options.fetchFn(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Findias'
      }
    })
  } catch (cause) {
    throw new CatalogError(
      'network',
      'Could not reach GitHub. Check your internet connection and try again.',
      { cause }
    )
  }
}

/**
 * Fetch, validate, and normalize the newest non-draft release into managed
 * `CatalogEntry[]`, throwing a typed `CatalogError` on any failure.
 */
const getCatalog = async (options: ResolvedOptions): Promise<CatalogEntry[]> => {
  const response = await fetchReleases(options)

  if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
    throw new CatalogError('rate-limited', rateLimitMessage(response.headers.get('x-ratelimit-reset')))
  }
  if (!response.ok) {
    throw new CatalogError('http', `GitHub returned an unexpected response (HTTP ${response.status}).`)
  }

  let json: unknown
  try {
    json = await response.json()
  } catch (cause) {
    throw new CatalogError('parse', 'GitHub returned a response Findias could not read.', { cause })
  }

  const parsed = releasesSchema.safeParse(json)
  if (!parsed.success) {
    throw new CatalogError('parse', 'GitHub release data was not in the expected format.', {
      cause: parsed.error
    })
  }

  // Newest non-draft release. We use the list endpoint (not /releases/latest) on
  // purpose so prereleases are included; GitHub returns newest-first.
  const release = parsed.data.find((entry) => entry.draft !== true)
  if (!release) return []

  const entries: CatalogEntry[] = []
  for (const rawAsset of release.assets ?? []) {
    const asset = assetSchema.safeParse(rawAsset)
    if (!asset.success) continue
    const parsedName = parseManagedModFileName(asset.data.name)
    if (!parsedName) continue
    entries.push(makeEntry(asset.data, parsedName, options.fetchFn))
  }
  return entries
}

/**
 * Current `ModCatalogProvider`: reads the Uiscias GitHub Releases feed, selects
 * the newest non-draft release (prereleases included), and returns its managed
 * `.it` assets as normalized `CatalogEntry[]`. Swappable for a manifest or
 * source-tree strategy by adding a sibling file that implements the same
 * interface — no consumer changes.
 */
export const createGitHubReleaseCatalogProvider = (
  options: GitHubCatalogOptions = {}
): ModCatalogProvider => {
  const resolved: ResolvedOptions = {
    owner: options.owner ?? DEFAULT_OWNER,
    repo: options.repo ?? DEFAULT_REPO,
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    fetchFn: options.fetchFn ?? fetch
  }
  return { getCatalog: (): Promise<CatalogEntry[]> => getCatalog(resolved) }
}
