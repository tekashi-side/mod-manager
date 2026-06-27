import { z } from 'zod';
import { CatalogError } from './catalog';

/** Minimal `fetch` shape we depend on; lets tests inject a stub without casts. */
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface GitHubReleasesOptions {
  owner?: string;
  repo?: string;
  baseUrl?: string;
  fetchFn?: FetchLike;
}

export interface ResolvedReleaseOptions {
  owner: string;
  repo: string;
  baseUrl: string;
  fetchFn: FetchLike;
}

/** A release asset we care about (name + download URL + optional size). */
export interface ReleaseAsset {
  name: string;
  size?: number;
  browser_download_url: string;
}

const DEFAULT_OWNER = 'Root50199';
const DEFAULT_REPO = 'Uiscias';
const DEFAULT_BASE_URL = 'https://api.github.com';

// GitHub release/asset JSON is untrusted input — validate the fields we consume.
// `assets` stays `unknown[]` so one malformed asset never fails the whole release.
const assetSchema = z.object({
  name: z.string(),
  size: z.number().optional(),
  browser_download_url: z.string(),
});

const releaseSchema = z.object({
  draft: z.boolean().optional(),
  prerelease: z.boolean().optional(),
  assets: z.array(z.unknown()).optional(),
});

const releasesSchema = z.array(releaseSchema);

export const resolveReleaseOptions = (options: GitHubReleasesOptions): ResolvedReleaseOptions => ({
  owner: options.owner ?? DEFAULT_OWNER,
  repo: options.repo ?? DEFAULT_REPO,
  baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
  fetchFn: options.fetchFn ?? fetch,
});

/** Build a friendly rate-limit message from the `x-ratelimit-reset` header. */
const rateLimitMessage = (resetHeader: string | null): string => {
  const resetSeconds = resetHeader ? Number.parseInt(resetHeader, 10) : Number.NaN;
  if (Number.isFinite(resetSeconds)) {
    const minutes = Math.max(1, Math.ceil((resetSeconds * 1000 - Date.now()) / 60_000));
    return `GitHub's hourly rate limit was reached. Try again in about ${minutes} minute(s).`;
  }
  return "GitHub's hourly rate limit was reached. Please try again later.";
};

/** Request the repo's releases feed, mapping connection failures to `CatalogError`. */
const fetchReleases = async (options: ResolvedReleaseOptions): Promise<Response> => {
  const url = `${options.baseUrl}/repos/${options.owner}/${options.repo}/releases`;
  try {
    return await options.fetchFn(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Findias',
      },
    });
  } catch (cause) {
    throw new CatalogError(
      'network',
      'Could not reach GitHub. Check your internet connection and try again.',
      { cause },
    );
  }
};

/**
 * Fetch the releases feed and return the assets of the newest eligible release,
 * mapping every failure mode to a typed `CatalogError`. Returns `null` when no
 * release matches (e.g. prereleases excluded and only prereleases exist). We use
 * the list endpoint (not `/releases/latest`) so prereleases can be included.
 */
export const fetchLatestReleaseAssets = async (
  options: ResolvedReleaseOptions,
  includePrereleases: boolean,
): Promise<ReleaseAsset[] | null> => {
  const response = await fetchReleases(options);

  if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
    throw new CatalogError(
      'rate-limited',
      rateLimitMessage(response.headers.get('x-ratelimit-reset')),
    );
  }
  if (!response.ok) {
    throw new CatalogError(
      'http',
      `GitHub returned an unexpected response (HTTP ${response.status}).`,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    throw new CatalogError('parse', 'GitHub returned a response Findias could not read.', {
      cause,
    });
  }

  const parsed = releasesSchema.safeParse(json);
  if (!parsed.success) {
    throw new CatalogError('parse', 'GitHub release data was not in the expected format.', {
      cause: parsed.error,
    });
  }

  // GitHub returns newest-first; pick the newest non-draft (and non-prerelease
  // when prereleases are excluded).
  const release = parsed.data.find((entry) => {
    if (entry.draft === true) return false;
    if (!includePrereleases && entry.prerelease === true) return false;
    return true;
  });
  if (!release) return null;

  const assets: ReleaseAsset[] = [];
  for (const rawAsset of release.assets ?? []) {
    const asset = assetSchema.safeParse(rawAsset);
    if (asset.success) assets.push(asset.data);
  }
  return assets;
};
