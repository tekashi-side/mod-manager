import { describe, expect, it } from 'vitest';
import { CatalogError } from './catalog';
import { createManifestCatalogProvider } from './manifestCatalog';
import type { FetchLike } from './githubReleases';

const manifest = {
  metadata: {
    schemaVersion: 1,
    currentGameVersion: '1.2.4',
    supportedGameVersion: '1.2.3',
    generatedAt: '2026-06-27T10:14:25.451Z',
  },
  modList: [
    {
      groupId: 'AchievmentUnhide',
      modName: 'Achievment Unhide',
      findiasTags: ['UI', 'QoL'],
      hasVariants: false,
      mutuallyExclusive: false,
      variants: [
        {
          modId: 'AchievmentUnhide',
          modName: 'Achievment Unhide',
          fileName: 'uisciasAchievmentUnhide_5.it',
          version: 5,
          size: 20838,
          updateType: 'volatile',
          usedFiles: ['data/db/AchievementTable.xml'],
          modAuthor: 'Root50199',
          modAdditionalCredits: 'None',
          recentUpdateNotes: 'n/a',
        },
      ],
    },
    {
      groupId: 'BriHpBars',
      modName: 'Bri Hp Bars',
      findiasTags: ['Combat', 'UI'],
      hasVariants: true,
      mutuallyExclusive: true,
      variants: [
        {
          modId: 'BriHpBars1And2',
          modName: 'Bri Hp Bars 1 And 2',
          fileName: 'uisciasBriHpBars1And2_3.it',
          version: 3,
          size: 1106734,
          updateType: 'volatile',
          usedFiles: ['data/db/Race.xml'],
          modAuthor: 'Root50199',
          modAdditionalCredits: 'None',
          recentUpdateNotes: 'n/a',
        },
        {
          modId: 'BriHpBars1And3',
          modName: 'Bri Hp Bars 1 And 3',
          fileName: 'uisciasBriHpBars1And3_3.it',
          version: 3,
          size: 1106735,
          updateType: 'volatile',
          usedFiles: ['data/db/Race.xml'],
          modAuthor: 'Root50199',
          modAdditionalCredits: 'None',
          recentUpdateNotes: 'n/a',
        },
      ],
    },
  ],
};

const MANIFEST_URL = 'https://example.com/manifestCatalog.json';

const releaseWith = (
  assets: { name: string; browser_download_url: string }[],
  prerelease = true,
) => [{ draft: false, prerelease, assets }];

const defaultAssets = [
  { name: 'manifestCatalog.json', browser_download_url: MANIFEST_URL },
  { name: 'uisciasAchievmentUnhide_5.it', browser_download_url: 'https://example.com/a.it' },
  { name: 'uisciasBriHpBars1And2_3.it', browser_download_url: 'https://example.com/b2.it' },
  { name: 'uisciasBriHpBars1And3_3.it', browser_download_url: 'https://example.com/b3.it' },
];

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

/** Build a fetch stub that serves the releases feed, the manifest, and asset bytes. */
const makeFetch = (
  releases: unknown,
  manifestBody: unknown = manifest,
): { fetchFn: FetchLike; requested: string[] } => {
  const requested: string[] = [];
  const fetchFn: FetchLike = async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.endsWith('/releases')) return jsonResponse(releases);
    if (url === MANIFEST_URL) return jsonResponse(manifestBody);
    return new Response('filebytes');
  };
  return { fetchFn, requested };
};

describe('ManifestCatalogProvider', () => {
  it('returns the grouped catalog from the manifest asset', async () => {
    const { fetchFn } = makeFetch(releaseWith(defaultAssets));
    const provider = createManifestCatalogProvider({ fetchFn });

    const catalog = await provider.getCatalog(true);

    expect(catalog.metadata).toMatchObject({
      schemaVersion: 1,
      currentGameVersion: '1.2.4',
      supportedGameVersion: '1.2.3',
    });
    expect(catalog.groups).toHaveLength(2);
    expect(catalog.groups[1]).toMatchObject({
      groupId: 'BriHpBars',
      hasVariants: true,
      mutuallyExclusive: true,
    });
    expect(catalog.groups[1].variants.map((v) => v.modId)).toEqual([
      'BriHpBars1And2',
      'BriHpBars1And3',
    ]);
    expect(catalog.groups[0].variants[0]).toMatchObject({
      modId: 'AchievmentUnhide',
      version: 5,
      size: 20838,
      updateType: 'volatile',
      usedFiles: ['data/db/AchievementTable.xml'],
    });
  });

  it('resolves variant bytes from the matching .it asset url', async () => {
    const { fetchFn, requested } = makeFetch(releaseWith(defaultAssets));
    const provider = createManifestCatalogProvider({ fetchFn });

    const catalog = await provider.getCatalog(true);
    const stream = await catalog.groups[0].variants[0].fetchBytes();

    expect(stream).toBeInstanceOf(ReadableStream);
    expect(requested).toContain('https://example.com/a.it');
  });

  it('errors when a stable release is requested but only a prerelease exists', async () => {
    const { fetchFn } = makeFetch(releaseWith(defaultAssets, true));
    const provider = createManifestCatalogProvider({ fetchFn });
    await expect(provider.getCatalog(false)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('errors when the release has no manifestCatalog.json', async () => {
    const assets = defaultAssets.filter((a) => a.name !== 'manifestCatalog.json');
    const { fetchFn } = makeFetch(releaseWith(assets));
    const provider = createManifestCatalogProvider({ fetchFn });
    await expect(provider.getCatalog(true)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects a manifest whose schemaVersion is newer than supported', async () => {
    const newer = { ...manifest, metadata: { ...manifest.metadata, schemaVersion: 99 } };
    const { fetchFn } = makeFetch(releaseWith(defaultAssets), newer);
    const provider = createManifestCatalogProvider({ fetchFn });
    await expect(provider.getCatalog(true)).rejects.toMatchObject({ code: 'parse' });
  });

  it('rejects a malformed manifest', async () => {
    const { fetchFn } = makeFetch(releaseWith(defaultAssets), { nope: true });
    const provider = createManifestCatalogProvider({ fetchFn });
    await expect(provider.getCatalog(true)).rejects.toBeInstanceOf(CatalogError);
    await expect(provider.getCatalog(true)).rejects.toMatchObject({ code: 'parse' });
  });

  it('maps a connection failure to a network CatalogError', async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error('ENOTFOUND');
    };
    const provider = createManifestCatalogProvider({ fetchFn });
    await expect(provider.getCatalog(true)).rejects.toMatchObject({ code: 'network' });
  });
});
