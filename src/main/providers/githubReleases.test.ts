import { describe, expect, it } from 'vitest';
import { CatalogError } from './catalog';
import { fetchLatestReleaseAssets, resolveReleaseOptions, type FetchLike } from './githubReleases';

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

const optionsWith = (fetchFn: FetchLike) => resolveReleaseOptions({ fetchFn });

describe('fetchLatestReleaseAssets', () => {
  it('returns the assets of the newest non-draft release', async () => {
    const body = [
      { draft: true, assets: [{ name: 'skip.json', browser_download_url: 'x' }] },
      {
        draft: false,
        prerelease: false,
        assets: [{ name: 'manifestCatalog.json', browser_download_url: 'https://e/m.json' }],
      },
    ];
    const assets = await fetchLatestReleaseAssets(
      optionsWith(async () => jsonResponse(body)),
      true,
    );
    expect(assets?.map((a) => a.name)).toEqual(['manifestCatalog.json']);
  });

  it('includes prereleases when allowed', async () => {
    const body = [
      { draft: false, prerelease: true, assets: [{ name: 'a', browser_download_url: 'u' }] },
    ];
    const assets = await fetchLatestReleaseAssets(
      optionsWith(async () => jsonResponse(body)),
      true,
    );
    expect(assets?.map((a) => a.name)).toEqual(['a']);
  });

  it('skips prereleases when excluded and falls through to the newest stable one', async () => {
    const body = [
      { draft: false, prerelease: true, assets: [{ name: 'pre', browser_download_url: 'u' }] },
      { draft: false, prerelease: false, assets: [{ name: 'stable', browser_download_url: 'u' }] },
    ];
    const assets = await fetchLatestReleaseAssets(
      optionsWith(async () => jsonResponse(body)),
      false,
    );
    expect(assets?.map((a) => a.name)).toEqual(['stable']);
  });

  it('returns null when no release matches the prerelease filter', async () => {
    const body = [
      { draft: false, prerelease: true, assets: [{ name: 'pre', browser_download_url: 'u' }] },
    ];
    expect(
      await fetchLatestReleaseAssets(
        optionsWith(async () => jsonResponse(body)),
        false,
      ),
    ).toBeNull();
  });

  it('skips malformed assets without failing the whole release', async () => {
    const body = [
      {
        draft: false,
        assets: [{ name: 'ok', browser_download_url: 'u' }, { broken: true }],
      },
    ];
    const assets = await fetchLatestReleaseAssets(
      optionsWith(async () => jsonResponse(body)),
      true,
    );
    expect(assets?.map((a) => a.name)).toEqual(['ok']);
  });

  it('throws a network CatalogError when the request fails', async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error('ENOTFOUND');
    };
    await expect(fetchLatestReleaseAssets(optionsWith(fetchFn), true)).rejects.toMatchObject({
      code: 'network',
    });
  });

  it('throws a rate-limited CatalogError on a 403 with no remaining quota', async () => {
    const reset = String(Math.ceil(Date.now() / 1000) + 600);
    const fetchFn: FetchLike = async () =>
      new Response('rate limited', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset },
      });
    await expect(fetchLatestReleaseAssets(optionsWith(fetchFn), true)).rejects.toMatchObject({
      code: 'rate-limited',
    });
  });

  it('throws an http CatalogError on other non-ok responses', async () => {
    const fetchFn: FetchLike = async () => new Response('boom', { status: 500 });
    await expect(fetchLatestReleaseAssets(optionsWith(fetchFn), true)).rejects.toBeInstanceOf(
      CatalogError,
    );
    await expect(fetchLatestReleaseAssets(optionsWith(fetchFn), true)).rejects.toMatchObject({
      code: 'http',
    });
  });

  it('throws a parse CatalogError when the payload is not the expected shape', async () => {
    const fetchFn: FetchLike = async () => jsonResponse({ not: 'an array' });
    await expect(fetchLatestReleaseAssets(optionsWith(fetchFn), true)).rejects.toMatchObject({
      code: 'parse',
    });
  });
});
