import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

// Hoisted so the value exists when the electron mock factory runs (which is
// before the normal import bindings are initialized). Avoid importing helpers
// here for the same reason; rely on the always-available `process` global.
const { userDataDir } = vi.hoisted(() => ({
  userDataDir: `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/findias-settingsstore-test`,
}));

// settingsStore reads `app.getPath('userData')`; point it at a temp dir so the
// load/save round-trip can be exercised without a running Electron runtime.
vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
}));

import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from './settingsStore';

const settingsFile = join(userDataDir, 'findias-settings.json');

describe('parseSettings', () => {
  it('accepts a valid string path', () => {
    expect(parseSettings({ gameRootPath: 'D:/Nexon/mabinogi/appdata' })).toEqual({
      gameRootPath: 'D:/Nexon/mabinogi/appdata',
      includePrereleases: true,
    });
  });

  it('accepts an explicit null path', () => {
    expect(parseSettings({ gameRootPath: null })).toEqual({
      gameRootPath: null,
      includePrereleases: true,
    });
  });

  it('reads an explicit includePrereleases value', () => {
    expect(parseSettings({ gameRootPath: null, includePrereleases: false })).toEqual({
      gameRootPath: null,
      includePrereleases: false,
    });
  });

  it('resets a wrong-typed field to the default', () => {
    expect(parseSettings({ gameRootPath: 42 })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ gameRootPath: ['a', 'b'] })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ gameRootPath: null, includePrereleases: 'yes' })).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('fills missing fields with defaults', () => {
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('strips unknown extra keys', () => {
    expect(parseSettings({ gameRootPath: null, bogus: true })).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults for non-object input', () => {
    expect(parseSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(42)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings([])).toEqual(DEFAULT_SETTINGS);
  });
});

describe('loadSettings / saveSettings', () => {
  beforeEach(async () => {
    await fs.mkdir(userDataDir, { recursive: true });
    await fs.rm(settingsFile, { force: true });
  });

  afterEach(async () => {
    await fs.rm(userDataDir, { recursive: true, force: true });
  });

  it('returns defaults when no settings file exists', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved settings', async () => {
    await saveSettings({ gameRootPath: 'D:/Nexon/mabinogi/appdata', includePrereleases: false });
    expect(await loadSettings()).toEqual({
      gameRootPath: 'D:/Nexon/mabinogi/appdata',
      includePrereleases: false,
    });
  });

  it('defaults includePrereleases to true for an older file missing the field', async () => {
    await fs.writeFile(settingsFile, JSON.stringify({ gameRootPath: 'D:/x' }), 'utf-8');
    expect(await loadSettings()).toEqual({ gameRootPath: 'D:/x', includePrereleases: true });
  });

  it('returns defaults when the file is corrupt JSON', async () => {
    await fs.writeFile(settingsFile, '{ not valid json', 'utf-8');
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('sanitizes a wrong-typed field read from disk', async () => {
    await fs.writeFile(settingsFile, JSON.stringify({ gameRootPath: 42 }), 'utf-8');
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
