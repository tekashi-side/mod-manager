import {
  CatalogError,
  type Catalog,
  type CatalogGroup,
  type CatalogMetadata,
  type CatalogVariant,
  type ModCatalogProvider,
} from './catalog';
import {
  fetchLatestReleaseAssets,
  resolveReleaseOptions,
  type FetchLike,
  type GitHubReleasesOptions,
  type ResolvedReleaseOptions,
} from './githubReleases';
import {
  MANIFEST_SCHEMA_VERSION,
  manifestCatalogSchema,
  type ManifestVariant,
} from './manifestSchema';

export type { FetchLike };
export type ManifestCatalogOptions = GitHubReleasesOptions;

/** The release asset that carries the full catalog. */
const MANIFEST_ASSET_NAME = 'manifestCatalog.json';

/** Build a normalized `CatalogVariant`, resolving its bytes from the asset map. */
const makeVariant = (
  variant: ManifestVariant,
  urlByFileName: Map<string, string>,
  fetchFn: FetchLike,
): CatalogVariant => ({
  modId: variant.modId,
  modName: variant.modName,
  fileName: variant.fileName,
  version: variant.version,
  size: variant.size,
  updateType: variant.updateType,
  usedFiles: variant.usedFiles,
  modAuthor: variant.modAuthor,
  modAdditionalCredits: variant.modAdditionalCredits,
  recentUpdateNotes: variant.recentUpdateNotes,
  fetchBytes: async (): Promise<ReadableStream<Uint8Array>> => {
    const url = urlByFileName.get(variant.fileName);
    if (!url) {
      throw new CatalogError(
        'parse',
        `The latest release is missing the file ${variant.fileName}.`,
      );
    }
    let response: Response;
    try {
      response = await fetchFn(url);
    } catch (cause) {
      throw new CatalogError('network', `Could not download ${variant.fileName}.`, { cause });
    }
    if (!response.ok || !response.body) {
      throw new CatalogError(
        'http',
        `Failed to download ${variant.fileName} (HTTP ${response.status}).`,
      );
    }
    return response.body;
  },
});

/** Fetch + parse the manifest asset of the newest eligible release. */
const getCatalog = async (
  options: ResolvedReleaseOptions,
  includePrereleases: boolean,
): Promise<Catalog> => {
  const assets = await fetchLatestReleaseAssets(options, includePrereleases);
  if (!assets) {
    throw new CatalogError(
      'not-found',
      includePrereleases
        ? 'No Uiscias release was found.'
        : 'No stable Uiscias release was found. Turn on "Include prereleases" to see the latest mods.',
    );
  }

  const manifestAsset = assets.find((asset) => asset.name === MANIFEST_ASSET_NAME);
  if (!manifestAsset) {
    throw new CatalogError(
      'not-found',
      'The latest release does not contain a manifestCatalog.json. It may not be published yet.',
    );
  }

  const urlByFileName = new Map<string, string>();
  for (const asset of assets) {
    if (asset.name.toLowerCase().endsWith('.it')) {
      urlByFileName.set(asset.name, asset.browser_download_url);
    }
  }

  let response: Response;
  try {
    response = await options.fetchFn(manifestAsset.browser_download_url);
  } catch (cause) {
    throw new CatalogError('network', 'Could not download the mod catalog.', { cause });
  }
  if (!response.ok) {
    throw new CatalogError('http', `Failed to download the mod catalog (HTTP ${response.status}).`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    throw new CatalogError('parse', 'The mod catalog could not be read.', { cause });
  }

  const parsed = manifestCatalogSchema.safeParse(json);
  if (!parsed.success) {
    throw new CatalogError('parse', 'The mod catalog was not in the expected format.', {
      cause: parsed.error,
    });
  }

  if (parsed.data.metadata.schemaVersion > MANIFEST_SCHEMA_VERSION) {
    throw new CatalogError(
      'parse',
      'This mod catalog requires a newer version of Findias. Please update the app.',
    );
  }

  const metadata: CatalogMetadata = {
    schemaVersion: parsed.data.metadata.schemaVersion,
    currentGameVersion: parsed.data.metadata.currentGameVersion,
    supportedGameVersion: parsed.data.metadata.supportedGameVersion,
    generatedAt: parsed.data.metadata.generatedAt,
  };

  const groups: CatalogGroup[] = parsed.data.modList.map((group) => ({
    groupId: group.groupId,
    modName: group.modName,
    findiasTags: group.findiasTags,
    hasVariants: group.hasVariants,
    mutuallyExclusive: group.mutuallyExclusive,
    variants: group.variants.map((variant) => makeVariant(variant, urlByFileName, options.fetchFn)),
  }));

  return { metadata, groups };
};

/**
 * Current `ModCatalogProvider`: reads the `manifestCatalog.json` asset attached
 * to the newest eligible Uiscias release and returns its grouped catalog. The
 * manifest's grouped shape is preserved 1:1 (no flatten/regroup), and each
 * variant's `.it` download URL is resolved from the release's assets.
 */
export const createManifestCatalogProvider = (
  options: ManifestCatalogOptions = {},
): ModCatalogProvider => {
  const resolved = resolveReleaseOptions(options);
  return {
    getCatalog: (includePrereleases: boolean): Promise<Catalog> =>
      getCatalog(resolved, includePrereleases),
  };
};
