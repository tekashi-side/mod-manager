import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { z } from 'zod';

const SETTINGS_FILE = 'findias-settings.json';

/**
 * Single source of truth for the persisted settings shape. The schema validates
 * untrusted JSON read from disk; the TypeScript `Settings` type is derived from
 * it via `z.infer`, so the shape is never declared in two places.
 *
 * Main-process only for now. If settings ever cross the IPC boundary (e.g. a
 * preferences screen), promote the schema/type into the shared layer.
 */
export const settingsSchema = z.object({
  /** Absolute path to the Mabinogi `appdata` root folder, or null if unset. */
  gameRootPath: z.string().nullable().catch(null),
  /**
   * Whether prerelease GitHub releases are eligible when selecting the newest
   * Uiscias release. Defaults to true because the manifest currently ships only
   * on prereleases. The `.catch` keeps older settings files (missing the field)
   * valid by falling back to the default.
   */
  includePrereleases: z.boolean().catch(true),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  gameRootPath: null,
  includePrereleases: true,
};

/**
 * Validate unknown input (e.g. parsed JSON) into a guaranteed-valid `Settings`.
 * Individual invalid/missing fields fall back to their defaults via the schema's
 * per-field `.catch(...)`; a wholly invalid value (non-object) returns defaults.
 */
export const parseSettings = (value: unknown): Settings => {
  const result = settingsSchema.safeParse(value);
  return result.success ? result.data : { ...DEFAULT_SETTINGS };
};

const settingsPath = (): string => join(app.getPath('userData'), SETTINGS_FILE);

/**
 * Load persisted settings. Returns defaults if the file is missing or corrupt,
 * and validates the parsed JSON against the schema so a bad/edited file can
 * never inject an unexpected shape.
 */
export const loadSettings = async (): Promise<Settings> => {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8');
    return parseSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

/** Persist settings as pretty-printed JSON in the userData folder. */
export const saveSettings = async (settings: Settings): Promise<void> => {
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
};
