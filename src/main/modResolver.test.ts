import { describe, expect, it } from 'vitest'
import type { CatalogEntry } from './providers/catalog'
import type { InstalledMod } from './providers/installed'
import { resolveModList } from './modResolver'

const entry = (modId: string, version: number, size = 10): CatalogEntry => ({
  modId,
  version,
  fileName: `uiscias${modId}_${version}.it`,
  size,
  fetchBytes: async (): Promise<ReadableStream<Uint8Array>> => new ReadableStream<Uint8Array>()
})

const installed = (modId: string, version: number, enabled: boolean): InstalledMod => ({
  modId,
  version,
  fileName: `uiscias${modId}_${version}.it`,
  enabled
})

describe('resolveModList', () => {
  it('returns an empty list when both sources are empty', () => {
    expect(resolveModList([], [])).toEqual([])
  })

  it('marks a release-only mod as not-installed', () => {
    const [row] = resolveModList([entry('Foo', 3)], [])
    expect(row).toMatchObject({
      modId: 'Foo',
      status: 'not-installed',
      releaseVersion: 3,
      installedVersion: null,
      actions: ['install']
    })
  })

  it('marks a matching enabled mod as up-to-date', () => {
    const [row] = resolveModList([entry('Foo', 3)], [installed('Foo', 3, true)])
    expect(row).toMatchObject({ status: 'up-to-date', actions: ['disable', 'delete'] })
  })

  it('treats an installed version newer than the release as up-to-date', () => {
    const [row] = resolveModList([entry('Foo', 2)], [installed('Foo', 3, true)])
    expect(row).toMatchObject({
      status: 'up-to-date',
      installedVersion: 3,
      actions: ['disable', 'delete']
    })
  })

  it('flags an older enabled mod as update-available', () => {
    const [row] = resolveModList([entry('Foo', 5)], [installed('Foo', 3, true)])
    expect(row).toMatchObject({
      status: 'update-available',
      releaseVersion: 5,
      installedVersion: 3,
      actions: ['update', 'disable', 'delete']
    })
  })

  it('marks a disabled stale mod as disabled with enable + update + delete', () => {
    const [row] = resolveModList([entry('Foo', 5)], [installed('Foo', 3, false)])
    expect(row).toMatchObject({
      status: 'disabled',
      installedVersion: 3,
      actions: ['enable', 'update', 'delete']
    })
  })

  it('marks a disabled up-to-date mod as disabled with enable + delete only', () => {
    const [row] = resolveModList([entry('Foo', 3)], [installed('Foo', 3, false)])
    expect(row).toMatchObject({ status: 'disabled', actions: ['enable', 'delete'] })
  })

  it('marks an installed mod absent from the release as an orphan', () => {
    const [row] = resolveModList([], [installed('Foo', 3, true)])
    expect(row).toMatchObject({
      status: 'orphan',
      releaseVersion: null,
      installedVersion: 3,
      actions: ['delete']
    })
  })

  it('treats a disabled mod absent from the release as an orphan (delete only)', () => {
    const [row] = resolveModList([], [installed('Foo', 2, false)])
    expect(row).toMatchObject({ status: 'orphan', actions: ['delete'] })
  })

  it('prioritizes the enabled file when both enabled and disabled exist', () => {
    const rows = resolveModList(
      [entry('Foo', 5)],
      [installed('Foo', 4, true), installed('Foo', 3, false)]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      status: 'update-available',
      installedVersion: 4,
      actions: ['update', 'disable', 'delete']
    })
  })

  it('collapses duplicate files to the highest version in the same location', () => {
    const [row] = resolveModList(
      [entry('Foo', 5)],
      [installed('Foo', 3, true), installed('Foo', 5, true)]
    )
    expect(row).toMatchObject({ status: 'up-to-date', installedVersion: 5 })
  })

  it('sorts rows by name', () => {
    const rows = resolveModList([entry('Zeta', 1), entry('Alpha', 1)], [])
    expect(rows.map((r) => r.modId)).toEqual(['Alpha', 'Zeta'])
  })

  it('carries the release asset size, and leaves orphans sizeless', () => {
    const [inRelease] = resolveModList([entry('Foo', 3, 999)], [])
    expect(inRelease.size).toBe(999)

    const [orphan] = resolveModList([], [installed('Bar', 1, true)])
    expect(orphan.size).toBeNull()
  })
})
