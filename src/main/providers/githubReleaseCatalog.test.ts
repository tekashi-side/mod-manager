import { describe, expect, it } from 'vitest'
import { CatalogError } from './catalog'
import { createGitHubReleaseCatalogProvider, type FetchLike } from './githubReleaseCatalog'

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  })

const publishedRelease = {
  draft: false,
  prerelease: true,
  assets: [
    {
      name: 'uisciasDDtimer_5.it',
      size: 100,
      browser_download_url: 'https://example.com/uisciasDDtimer_5.it'
    },
    // Unmanaged (no uiscias prefix) — must be skipped.
    { name: 'DDtimer_5.it', size: 100, browser_download_url: 'https://example.com/DDtimer_5.it' },
    // Non-mod asset — must be skipped.
    { name: 'source.zip', size: 9, browser_download_url: 'https://example.com/source.zip' }
  ]
}

describe('GitHubReleaseCatalogProvider', () => {
  it('returns only managed .it assets from the newest non-draft release', async () => {
    const fetchFn: FetchLike = async () => jsonResponse([publishedRelease])
    const provider = createGitHubReleaseCatalogProvider({ fetchFn })

    const catalog = await provider.getCatalog()

    expect(catalog).toHaveLength(1)
    expect(catalog[0]).toMatchObject({
      modId: 'DDtimer',
      version: 5,
      fileName: 'uisciasDDtimer_5.it',
      size: 100
    })
  })

  it('skips draft releases and selects the newest published one', async () => {
    const body = [
      {
        draft: true,
        assets: [{ name: 'uisciasSkip_9.it', browser_download_url: 'https://example.com/a.it' }]
      },
      {
        draft: false,
        assets: [{ name: 'uisciasReal_2.it', browser_download_url: 'https://example.com/b.it' }]
      }
    ]
    const fetchFn: FetchLike = async () => jsonResponse(body)
    const provider = createGitHubReleaseCatalogProvider({ fetchFn })

    const catalog = await provider.getCatalog()
    expect(catalog.map((entry) => entry.modId)).toEqual(['Real'])
  })

  it('returns an empty catalog when there is no published release', async () => {
    const fetchFn: FetchLike = async () => jsonResponse([{ draft: true, assets: [] }])
    const provider = createGitHubReleaseCatalogProvider({ fetchFn })
    expect(await provider.getCatalog()).toEqual([])
  })

  it('throws a network CatalogError when the request fails', async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error('ENOTFOUND')
    }
    const provider = createGitHubReleaseCatalogProvider({ fetchFn })
    await expect(provider.getCatalog()).rejects.toMatchObject({ code: 'network' })
  })

  it('throws a rate-limited CatalogError on a 403 with no remaining quota', async () => {
    const reset = String(Math.ceil(Date.now() / 1000) + 600)
    const fetchFn: FetchLike = async () =>
      new Response('rate limited', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }
      })
    const provider = createGitHubReleaseCatalogProvider({ fetchFn })
    await expect(provider.getCatalog()).rejects.toMatchObject({ code: 'rate-limited' })
  })

  it('throws an http CatalogError on other non-ok responses', async () => {
    const fetchFn: FetchLike = async () => new Response('boom', { status: 500 })
    const provider = createGitHubReleaseCatalogProvider({ fetchFn })
    await expect(provider.getCatalog()).rejects.toBeInstanceOf(CatalogError)
    await expect(provider.getCatalog()).rejects.toMatchObject({ code: 'http' })
  })

  it('throws a parse CatalogError when the payload is not the expected shape', async () => {
    const fetchFn: FetchLike = async () => jsonResponse({ not: 'an array' })
    const provider = createGitHubReleaseCatalogProvider({ fetchFn })
    await expect(provider.getCatalog()).rejects.toMatchObject({ code: 'parse' })
  })

  it('fetchBytes downloads from the asset url and returns a byte stream', async () => {
    const requested: string[] = []
    const fetchFn: FetchLike = async (input) => {
      requested.push(String(input))
      if (String(input).endsWith('/releases')) return jsonResponse([publishedRelease])
      return new Response('filebytes')
    }
    const provider = createGitHubReleaseCatalogProvider({ fetchFn })

    const [entry] = await provider.getCatalog()
    const stream = await entry.fetchBytes()

    expect(stream).toBeInstanceOf(ReadableStream)
    expect(requested).toContain('https://example.com/uisciasDDtimer_5.it')
  })
})
