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

  it('maps optional readme + images onto the group and variant', async () => {
    const withDocs = {
      ...manifest,
      modList: [
        {
          ...manifest.modList[0],
          readme: '# Group readme',
          images: ['https://raw.githubusercontent.com/Root50199/Uiscias/v5/mods/A/images/g.png'],
          variants: [
            {
              ...manifest.modList[0].variants[0],
              readme: '# Variant readme',
              images: [
                'https://raw.githubusercontent.com/Root50199/Uiscias/v5/mods/A/images/v.png',
              ],
            },
          ],
        },
      ],
    };
    const { fetchFn } = makeFetch(releaseWith(defaultAssets), withDocs);
    const provider = createManifestCatalogProvider({ fetchFn });

    const catalog = await provider.getCatalog(true);
    expect(catalog.groups[0].readme).toBe('# Group readme');
    expect(catalog.groups[0].images).toEqual([
      'https://raw.githubusercontent.com/Root50199/Uiscias/v5/mods/A/images/g.png',
    ]);
    expect(catalog.groups[0].variants[0].readme).toBe('# Variant readme');
    expect(catalog.groups[0].variants[0].images).toEqual([
      'https://raw.githubusercontent.com/Root50199/Uiscias/v5/mods/A/images/v.png',
    ]);
  });

  it('leaves readme + images undefined when the manifest omits them', async () => {
    const { fetchFn } = makeFetch(releaseWith(defaultAssets));
    const provider = createManifestCatalogProvider({ fetchFn });

    const catalog = await provider.getCatalog(true);
    expect(catalog.groups[0].readme).toBeUndefined();
    expect(catalog.groups[0].images).toBeUndefined();
    expect(catalog.groups[0].variants[0].readme).toBeUndefined();
    expect(catalog.groups[0].variants[0].images).toBeUndefined();
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

const RATE_LIMIT_RESET = String(Math.ceil(Date.now() / 1000) + 600);

describe('ManifestCatalogProvider caching', () => {
  it('serves a cached catalog without re-fetching within the TTL', async () => {
    const { fetchFn, requested } = makeFetch(releaseWith(defaultAssets));
    const provider = createManifestCatalogProvider({ fetchFn });

    const first = await provider.getCatalog(true);
    const countAfterFirst = requested.length;
    const second = await provider.getCatalog(true);

    expect(second).toBe(first); // same cached object, no rebuild
    expect(requested.length).toBe(countAfterFirst); // no additional network calls
  });

  it('revalidates on force and reuses the cache on a 304 (no manifest re-download)', async () => {
    const requested: string[] = [];
    let releasesCalls = 0;
    const fetchFn: FetchLike = async (input, init) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith('/releases')) {
        releasesCalls += 1;
        if (releasesCalls === 1) {
          return jsonResponse(releaseWith(defaultAssets), { headers: { ETag: 'v1' } });
        }
        // A forced revalidation must send the cached ETag as If-None-Match.
        expect(new Headers(init?.headers).get('if-none-match')).toBe('v1');
        return new Response(null, { status: 304 });
      }
      if (url === MANIFEST_URL) return jsonResponse(manifest);
      return new Response('filebytes');
    };
    const provider = createManifestCatalogProvider({ fetchFn });

    const first = await provider.getCatalog(true);
    const manifestDownloads = requested.filter((u) => u === MANIFEST_URL).length;
    const second = await provider.getCatalog(true, { force: true });

    expect(second).toBe(first); // cache reused on 304
    expect(releasesCalls).toBe(2); // the feed was revalidated
    expect(requested.filter((u) => u === MANIFEST_URL).length).toBe(manifestDownloads); // not re-downloaded
  });

  it('rebuilds the catalog when a forced revalidation returns a changed feed (200)', async () => {
    let releasesCalls = 0;
    const updatedManifest = {
      ...manifest,
      metadata: { ...manifest.metadata, currentGameVersion: '9.9.9' },
    };
    const fetchFn: FetchLike = async (input) => {
      const url = String(input);
      if (url.endsWith('/releases')) {
        releasesCalls += 1;
        return jsonResponse(releaseWith(defaultAssets), {
          headers: { ETag: releasesCalls === 1 ? 'v1' : 'v2' },
        });
      }
      if (url === MANIFEST_URL)
        return jsonResponse(releasesCalls === 1 ? manifest : updatedManifest);
      return new Response('filebytes');
    };
    const provider = createManifestCatalogProvider({ fetchFn });

    const first = await provider.getCatalog(true);
    expect(first.metadata.currentGameVersion).toBe('1.2.4');

    const second = await provider.getCatalog(true, { force: true });
    expect(second.metadata.currentGameVersion).toBe('9.9.9');
  });

  it('serves the cached catalog when a forced revalidation is rate-limited', async () => {
    let releasesCalls = 0;
    const fetchFn: FetchLike = async (input) => {
      const url = String(input);
      if (url.endsWith('/releases')) {
        releasesCalls += 1;
        if (releasesCalls === 1) {
          return jsonResponse(releaseWith(defaultAssets), { headers: { ETag: 'v1' } });
        }
        return new Response('rate limited', {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': RATE_LIMIT_RESET },
        });
      }
      if (url === MANIFEST_URL) return jsonResponse(manifest);
      return new Response('filebytes');
    };
    const provider = createManifestCatalogProvider({ fetchFn });

    const first = await provider.getCatalog(true);
    const second = await provider.getCatalog(true, { force: true });

    expect(second).toBe(first); // transient rate-limit falls back to the cache
  });
});
