import { describe, expect, it } from 'vitest';
import type { Catalog, CatalogGroup, CatalogVariant } from './providers/catalog';
import type { InstalledMod } from './providers/installed';
import { resolveModList } from './modResolver';

const variant = (
  modId: string,
  version: number,
  opts: { size?: number; usedFiles?: string[]; updateType?: string; name?: string } = {},
): CatalogVariant => ({
  modId,
  modName: opts.name ?? modId,
  fileName: `uiscias${modId}_${version}.it`,
  version,
  size: opts.size ?? 10,
  updateType: opts.updateType ?? 'stable',
  usedFiles: opts.usedFiles ?? [],
  modAuthor: 'Root50199',
  fetchBytes: async (): Promise<ReadableStream<Uint8Array>> => new ReadableStream<Uint8Array>(),
});

/** A single-variant (non-variant) group built from one variant. */
const soloGroup = (v: CatalogVariant): CatalogGroup => ({
  groupId: v.modId,
  modName: v.modName,
  findiasTags: [],
  hasVariants: false,
  mutuallyExclusive: false,
  variants: [v],
});

const catalogOf = (
  groups: CatalogGroup[],
  meta: { current?: string; supported?: string } = {},
): Catalog => ({
  metadata: {
    schemaVersion: 1,
    currentGameVersion: meta.current ?? '1.0.0',
    supportedGameVersion: meta.supported ?? '1.0.0',
    generatedAt: '2026-06-27T00:00:00.000Z',
  },
  groups,
});

const installed = (modId: string, version: number, enabled: boolean): InstalledMod => ({
  modId,
  version,
  fileName: `uiscias${modId}_${version}.it`,
  enabled,
});

/** Shorthand: the first variant of the first group. */
const firstVariant = (result: ReturnType<typeof resolveModList>) => result.groups[0].variants[0];

describe('resolveModList', () => {
  it('returns no groups when both sources are empty', () => {
    expect(resolveModList(catalogOf([]), [])).toMatchObject({
      groups: [],
      metadata: { outdated: false },
    });
  });

  it('marks a release-only mod as not-installed', () => {
    const result = resolveModList(catalogOf([soloGroup(variant('Foo', 3))]), []);
    expect(firstVariant(result)).toMatchObject({
      modId: 'Foo',
      status: 'not-installed',
      releaseVersion: 3,
      installedVersion: null,
      actions: ['install'],
      conflicts: [],
    });
  });

  it('surfaces variant docs + author metadata on the row', () => {
    const v: CatalogVariant = {
      ...variant('Foo', 1),
      modAuthor: 'Neko',
      modAdditionalCredits: 'Bri',
      recentUpdateNotes: 'Fixed X',
      readme: '# Foo',
      images: ['https://raw.githubusercontent.com/Root50199/Uiscias/v1/mods/Foo/images/a.png'],
    };
    const result = resolveModList(catalogOf([soloGroup(v)]), []);
    expect(firstVariant(result)).toMatchObject({
      modAuthor: 'Neko',
      modAdditionalCredits: 'Bri',
      recentUpdateNotes: 'Fixed X',
      readme: '# Foo',
      images: ['https://raw.githubusercontent.com/Root50199/Uiscias/v1/mods/Foo/images/a.png'],
    });
  });

  it('leaves credits + notes undefined when the variant omits them', () => {
    const result = resolveModList(catalogOf([soloGroup(variant('Foo', 1))]), []);
    expect(firstVariant(result).modAdditionalCredits).toBeUndefined();
    expect(firstVariant(result).recentUpdateNotes).toBeUndefined();
  });

  it('carries group-level readme + images onto the group row', () => {
    const group: CatalogGroup = {
      ...soloGroup(variant('Foo', 1)),
      readme: '# Group',
      images: ['https://raw.githubusercontent.com/Root50199/Uiscias/v1/mods/Foo/images/g.png'],
    };
    const result = resolveModList(catalogOf([group]), []);
    expect(result.groups[0]).toMatchObject({
      readme: '# Group',
      images: ['https://raw.githubusercontent.com/Root50199/Uiscias/v1/mods/Foo/images/g.png'],
    });
  });

  it('marks a matching enabled mod as up-to-date', () => {
    const result = resolveModList(catalogOf([soloGroup(variant('Foo', 3))]), [
      installed('Foo', 3, true),
    ]);
    expect(firstVariant(result)).toMatchObject({
      status: 'up-to-date',
      actions: ['disable', 'delete'],
    });
  });

  it('treats an installed version newer than the release as up-to-date', () => {
    const result = resolveModList(catalogOf([soloGroup(variant('Foo', 2))]), [
      installed('Foo', 3, true),
    ]);
    expect(firstVariant(result)).toMatchObject({
      status: 'up-to-date',
      installedVersion: 3,
      actions: ['disable', 'delete'],
    });
  });

  it('flags an older enabled mod as update-available', () => {
    const result = resolveModList(catalogOf([soloGroup(variant('Foo', 5))]), [
      installed('Foo', 3, true),
    ]);
    expect(firstVariant(result)).toMatchObject({
      status: 'update-available',
      releaseVersion: 5,
      installedVersion: 3,
      actions: ['update', 'disable', 'delete'],
    });
  });

  it('marks a disabled stale mod as disabled with enable + update + delete', () => {
    const result = resolveModList(catalogOf([soloGroup(variant('Foo', 5))]), [
      installed('Foo', 3, false),
    ]);
    expect(firstVariant(result)).toMatchObject({
      status: 'disabled',
      installedVersion: 3,
      actions: ['enable', 'update', 'delete'],
    });
  });

  it('marks a disabled up-to-date mod as disabled with enable + delete only', () => {
    const result = resolveModList(catalogOf([soloGroup(variant('Foo', 3))]), [
      installed('Foo', 3, false),
    ]);
    expect(firstVariant(result)).toMatchObject({
      status: 'disabled',
      actions: ['enable', 'delete'],
    });
  });

  it('marks an installed mod absent from the release as an orphan', () => {
    const result = resolveModList(catalogOf([]), [installed('Foo', 3, true)]);
    expect(firstVariant(result)).toMatchObject({
      status: 'orphan',
      releaseVersion: null,
      installedVersion: 3,
      actions: ['delete'],
    });
  });

  it('prioritizes the enabled file when both enabled and disabled exist', () => {
    const result = resolveModList(catalogOf([soloGroup(variant('Foo', 5))]), [
      installed('Foo', 4, true),
      installed('Foo', 3, false),
    ]);
    expect(result.groups).toHaveLength(1);
    expect(firstVariant(result)).toMatchObject({
      status: 'update-available',
      installedVersion: 4,
      actions: ['update', 'disable', 'delete'],
    });
    expect(result.groups[0].installedVariantId).toBe('Foo');
  });

  it('sorts groups by name', () => {
    const result = resolveModList(
      catalogOf([soloGroup(variant('Zeta', 1)), soloGroup(variant('Alpha', 1))]),
      [],
    );
    expect(result.groups.map((g) => g.groupId)).toEqual(['Alpha', 'Zeta']);
  });

  it('carries the release asset size, and leaves orphans sizeless', () => {
    const inRelease = resolveModList(catalogOf([soloGroup(variant('Foo', 3, { size: 999 }))]), []);
    expect(firstVariant(inRelease).size).toBe(999);

    const orphan = resolveModList(catalogOf([]), [installed('Bar', 1, true)]);
    expect(firstVariant(orphan).size).toBeNull();
  });

  it('returns orphan groups and null metadata when the catalog is unavailable', () => {
    const result = resolveModList(null, [installed('Foo', 2, true)]);
    expect(result.metadata).toBeNull();
    expect(firstVariant(result)).toMatchObject({ status: 'orphan', actions: ['delete'] });
  });

  describe('conflicts (enabled-only)', () => {
    const shared = ['data/db/Race.xml'];

    it('blocks installing a mod that conflicts with an enabled mod, naming it', () => {
      const catalog = catalogOf([
        soloGroup(variant('A', 1, { usedFiles: shared, name: 'Mod A' })),
        soloGroup(variant('B', 1, { usedFiles: shared, name: 'Mod B' })),
      ]);
      const result = resolveModList(catalog, [installed('A', 1, true)]);
      const bRow = result.groups.find((g) => g.groupId === 'B')!.variants[0];
      expect(bRow.actions).toEqual([]);
      expect(bRow.conflicts).toEqual([{ modId: 'A', modName: 'Mod A' }]);
    });

    it('does NOT block installs when the conflicting mod is only disabled', () => {
      const catalog = catalogOf([
        soloGroup(variant('A', 1, { usedFiles: shared })),
        soloGroup(variant('B', 1, { usedFiles: shared })),
      ]);
      const result = resolveModList(catalog, [installed('A', 1, false)]);
      const bRow = result.groups.find((g) => g.groupId === 'B')!.variants[0];
      expect(bRow.actions).toEqual(['install']);
      expect(bRow.conflicts).toEqual([]);
    });

    it('makes a conflicting disabled mod delete-only (enable blocked)', () => {
      const catalog = catalogOf([
        soloGroup(variant('A', 1, { usedFiles: shared, name: 'Mod A' })),
        soloGroup(variant('B', 1, { usedFiles: shared })),
      ]);
      const result = resolveModList(catalog, [installed('A', 1, true), installed('B', 1, false)]);
      const bRow = result.groups.find((g) => g.groupId === 'B')!.variants[0];
      expect(bRow.status).toBe('disabled');
      expect(bRow.actions).toEqual(['delete']);
      expect(bRow.conflicts).toEqual([{ modId: 'A', modName: 'Mod A' }]);
    });

    it('does not treat same-group variants as conflicts (auto-switch)', () => {
      const group: CatalogGroup = {
        groupId: 'BriHpBars',
        modName: 'Bri Hp Bars',
        findiasTags: [],
        hasVariants: true,
        mutuallyExclusive: true,
        variants: [
          variant('BriHpBars1And2', 1, { usedFiles: shared }),
          variant('BriHpBars1And3', 1, { usedFiles: shared }),
        ],
      };
      const result = resolveModList(catalogOf([group]), [installed('BriHpBars1And2', 1, true)]);
      const other = result.groups[0].variants.find((v) => v.modId === 'BriHpBars1And3')!;
      expect(other.conflicts).toEqual([]);
      expect(other.actions).toEqual(['install']);
    });
  });

  it('sets the banner-only outdated flag without affecting status', () => {
    const result = resolveModList(
      catalogOf([soloGroup(variant('Foo', 3))], { current: '1.2.4', supported: '1.2.3' }),
      [installed('Foo', 3, true)],
    );
    expect(result.metadata?.outdated).toBe(true);
    // The mod is current; outdated metadata must not change its status.
    expect(firstVariant(result).status).toBe('up-to-date');
  });
});
