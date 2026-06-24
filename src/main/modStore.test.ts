import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { resolveGamePaths } from './gameLocation'
import { createPackageModStore } from './modStore'

const root = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/findias-modstore-test`
const paths = resolveGamePaths(root)

const touch = async (dir: string, name: string): Promise<void> => {
  await fs.writeFile(join(dir, name), 'x', 'utf-8')
}

describe('PackageModStore.removeManaged', () => {
  beforeEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
    await fs.mkdir(paths.disabledDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('removes all managed files for a modId from root and disabled', async () => {
    await touch(paths.packageDir, 'uisciasFoo_3.it')
    await touch(paths.disabledDir, 'uisciasFoo_2.it')
    await touch(paths.packageDir, 'uisciasBar_1.it')
    await touch(paths.packageDir, 'data_00001.it')

    await createPackageModStore(paths).removeManaged('Foo')

    expect((await fs.readdir(paths.packageDir)).sort()).toEqual(['data_00001.it', 'disabled', 'uisciasBar_1.it'])
    expect(await fs.readdir(paths.disabledDir)).toEqual([])
  })

  it('keeps the excepted file (replace semantics) while removing older versions', async () => {
    await touch(paths.packageDir, 'uisciasFoo_3.it')
    await touch(paths.packageDir, 'uisciasFoo_2.it')
    await touch(paths.disabledDir, 'uisciasFoo_1.it')

    await createPackageModStore(paths).removeManaged('Foo', 'uisciasFoo_3.it')

    expect(await fs.readdir(paths.packageDir)).toEqual(['disabled', 'uisciasFoo_3.it'])
    expect(await fs.readdir(paths.disabledDir)).toEqual([])
  })

  it('never touches unmanaged or other mods', async () => {
    await touch(paths.packageDir, 'uisciasBar_1.it')
    await touch(paths.packageDir, 'randommod.it')

    await createPackageModStore(paths).removeManaged('Foo')

    expect((await fs.readdir(paths.packageDir)).sort()).toEqual(['disabled', 'randommod.it', 'uisciasBar_1.it'])
  })

  it('does not fail when the disabled folder is absent', async () => {
    await fs.rm(paths.disabledDir, { recursive: true, force: true })
    await touch(paths.packageDir, 'uisciasFoo_1.it')

    await expect(createPackageModStore(paths).removeManaged('Foo')).resolves.toBeUndefined()
    expect(await fs.readdir(paths.packageDir)).toEqual([])
  })
})

describe('PackageModStore.setDisabled', () => {
  beforeEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
    await fs.mkdir(paths.packageDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('disables by moving the file into a lazily-created disabled folder', async () => {
    await touch(paths.packageDir, 'uisciasFoo_3.it')

    await createPackageModStore(paths).setDisabled('Foo', true)

    expect(await fs.readdir(paths.packageDir)).toEqual(['disabled'])
    expect(await fs.readdir(paths.disabledDir)).toEqual(['uisciasFoo_3.it'])
  })

  it('enables by moving the file back to the package root', async () => {
    await fs.mkdir(paths.disabledDir, { recursive: true })
    await touch(paths.disabledDir, 'uisciasFoo_3.it')

    await createPackageModStore(paths).setDisabled('Foo', false)

    expect(await fs.readdir(paths.packageDir)).toEqual(['disabled', 'uisciasFoo_3.it'])
    expect(await fs.readdir(paths.disabledDir)).toEqual([])
  })

  it('round-trips disable then enable', async () => {
    await touch(paths.packageDir, 'uisciasFoo_3.it')
    const store = createPackageModStore(paths)

    await store.setDisabled('Foo', true)
    await store.setDisabled('Foo', false)

    expect(await fs.readdir(paths.packageDir)).toEqual(['disabled', 'uisciasFoo_3.it'])
    expect(await fs.readdir(paths.disabledDir)).toEqual([])
  })

  it('only moves the targeted mod, leaving others in place', async () => {
    await touch(paths.packageDir, 'uisciasFoo_3.it')
    await touch(paths.packageDir, 'uisciasBar_1.it')

    await createPackageModStore(paths).setDisabled('Foo', true)

    expect((await fs.readdir(paths.packageDir)).sort()).toEqual(['disabled', 'uisciasBar_1.it'])
    expect(await fs.readdir(paths.disabledDir)).toEqual(['uisciasFoo_3.it'])
  })
})
