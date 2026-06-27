import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { resolveGamePaths } from './gameLocation';
import { createPackageModStore } from './modStore';
import { installOrUpdateMod } from './modInstaller';
import type { CatalogVariant } from './providers/catalog';

const root = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/findias-installer-test`;
const paths = resolveGamePaths(root);

const entryOf = (modId: string, version: number, ...payload: number[]): CatalogVariant => ({
  modId,
  modName: modId,
  fileName: `uiscias${modId}_${version}.it`,
  version,
  size: payload.length,
  updateType: 'stable',
  usedFiles: [],
  modAuthor: 'Root50199',
  modAdditionalCredits: 'None',
  recentUpdateNotes: 'n/a',
  fetchBytes: async (): Promise<ReadableStream<Uint8Array>> =>
    new ReadableStream({
      start(controller) {
        controller.enqueue(Uint8Array.from(payload));
        controller.close();
      },
    }),
});

describe('installOrUpdateMod', () => {
  beforeEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(paths.disabledDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('writes the release file into the package root for a fresh install', async () => {
    await installOrUpdateMod({
      entry: entryOf('Foo', 3, 1, 2, 3),
      store: createPackageModStore(paths),
      packageDir: paths.packageDir,
    });

    expect(new Uint8Array(await fs.readFile(join(paths.packageDir, 'uisciasFoo_3.it')))).toEqual(
      Uint8Array.from([1, 2, 3]),
    );
  });

  it('replaces the old version, leaving exactly one file for the modId', async () => {
    await fs.writeFile(join(paths.packageDir, 'uisciasFoo_2.it'), 'old', 'utf-8');

    await installOrUpdateMod({
      entry: entryOf('Foo', 3, 7),
      store: createPackageModStore(paths),
      packageDir: paths.packageDir,
    });

    const remaining = (await fs.readdir(paths.packageDir)).filter((n) => n !== 'disabled');
    expect(remaining).toEqual(['uisciasFoo_3.it']);
  });

  it('also clears a disabled copy when (re)installing', async () => {
    await fs.writeFile(join(paths.disabledDir, 'uisciasFoo_1.it'), 'old', 'utf-8');

    await installOrUpdateMod({
      entry: entryOf('Foo', 3, 7),
      store: createPackageModStore(paths),
      packageDir: paths.packageDir,
    });

    expect(await fs.readdir(paths.disabledDir)).toEqual([]);
    expect(await fs.readdir(paths.packageDir)).toContain('uisciasFoo_3.it');
  });

  it('removes installed sibling variants on an auto-switch', async () => {
    // An enabled sibling and a disabled sibling, both replaced by the new variant.
    await fs.writeFile(join(paths.packageDir, 'uisciasBriHpBars1And2_3.it'), 'old', 'utf-8');
    await fs.writeFile(join(paths.disabledDir, 'uisciasBriHpBars1And4_2.it'), 'old', 'utf-8');

    await installOrUpdateMod({
      entry: entryOf('BriHpBars1And3', 3, 9),
      store: createPackageModStore(paths),
      packageDir: paths.packageDir,
      replaceSiblings: ['BriHpBars1And2', 'BriHpBars1And4'],
    });

    const remaining = (await fs.readdir(paths.packageDir)).filter((n) => n !== 'disabled');
    expect(remaining).toEqual(['uisciasBriHpBars1And3_3.it']);
    expect(await fs.readdir(paths.disabledDir)).toEqual([]);
  });

  it('forwards download progress', async () => {
    const received: number[] = [];
    await installOrUpdateMod({
      entry: entryOf('Foo', 3, 4, 5, 6),
      store: createPackageModStore(paths),
      packageDir: paths.packageDir,
      onProgress: (n) => received.push(n),
    });
    expect(received).toEqual([3]);
  });
});
