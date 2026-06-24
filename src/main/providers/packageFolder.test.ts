import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { resolveGamePaths } from '../gameLocation';
import { createPackageFolderProvider } from './packageFolder';

const root = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/findias-installed-test`;
const paths = resolveGamePaths(root);

const touch = async (dir: string, name: string): Promise<void> => {
  await fs.writeFile(join(dir, name), 'x', 'utf-8');
};

describe('PackageFolderProvider', () => {
  beforeEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(paths.packageDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('returns an empty list for an empty package folder', async () => {
    const provider = createPackageFolderProvider(paths);
    expect(await provider.list()).toEqual([]);
  });

  it('returns an empty list when the package folder does not exist', async () => {
    await fs.rm(root, { recursive: true, force: true });
    const provider = createPackageFolderProvider(paths);
    expect(await provider.list()).toEqual([]);
  });

  it('lists managed mods in the root as enabled and ignores everything else', async () => {
    await touch(paths.packageDir, 'uisciasDDtimer_5.it');
    await touch(paths.packageDir, 'data_00001.it'); // official game file
    await touch(paths.packageDir, 'randommod.it'); // unmanaged third-party
    await touch(paths.packageDir, 'notes.txt'); // not a .it file

    const provider = createPackageFolderProvider(paths);
    expect(await provider.list()).toEqual([
      { modId: 'DDtimer', version: 5, fileName: 'uisciasDDtimer_5.it', enabled: true },
    ]);
  });

  it('marks mods in package/disabled as disabled', async () => {
    await fs.mkdir(paths.disabledDir, { recursive: true });
    await touch(paths.packageDir, 'uisciasFoo_2.it');
    await touch(paths.disabledDir, 'uisciasBar_3.it');

    const provider = createPackageFolderProvider(paths);
    const list = await provider.list();

    expect(list).toContainEqual({
      modId: 'Foo',
      version: 2,
      fileName: 'uisciasFoo_2.it',
      enabled: true,
    });
    expect(list).toContainEqual({
      modId: 'Bar',
      version: 3,
      fileName: 'uisciasBar_3.it',
      enabled: false,
    });
    expect(list).toHaveLength(2);
  });

  it('does not treat the disabled subfolder itself as a mod', async () => {
    await fs.mkdir(paths.disabledDir, { recursive: true });
    await touch(paths.packageDir, 'uisciasFoo_2.it');

    const provider = createPackageFolderProvider(paths);
    expect(await provider.list()).toEqual([
      { modId: 'Foo', version: 2, fileName: 'uisciasFoo_2.it', enabled: true },
    ]);
  });
});
