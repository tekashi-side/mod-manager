import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveGamePaths, validateGameRoot } from './gameLocation'

describe('resolveGamePaths', () => {
  it('derives package and disabled paths under the root', () => {
    const root = join('X:', 'game', 'appdata')
    const paths = resolveGamePaths(root)
    expect(paths.root).toBe(root)
    expect(paths.packageDir).toBe(join(root, 'package'))
    expect(paths.disabledDir).toBe(join(root, 'package', 'disabled'))
  })
})

describe('validateGameRoot', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = await fs.mkdtemp(join(tmpdir(), 'findias-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('rejects empty input', async () => {
    expect((await validateGameRoot('')).ok).toBe(false)
  })

  it('rejects a non-existent folder', async () => {
    expect((await validateGameRoot(join(tmp, 'missing'))).ok).toBe(false)
  })

  it('rejects a folder without a package subfolder', async () => {
    const result = await validateGameRoot(tmp)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/package/i)
  })

  it('accepts a folder containing a package subfolder', async () => {
    await fs.mkdir(join(tmp, 'package'))
    expect((await validateGameRoot(tmp)).ok).toBe(true)
  })
})
