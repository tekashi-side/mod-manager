/**
 * Findias's copy of the Uiscias `manifestCatalog.json` schema. Per the project
 * decision, the schema is **copied** into both repos until a shared package
 * exists (see docs/architecture.md "Schema sharing").
 *
 * This copy is deliberately **lenient** so an older Findias can still read a
 * newer manifest:
 * - `findiasTags` is `string[]` (not a closed enum), so new upstream tags render
 *   instead of failing validation.
 * - `updateType` falls back to `volatile` for unknown values.
 * - `metadata` passes through unknown top-level fields.
 *
 * The raw manifest never crosses the IPC boundary; only the derived DTOs in
 * `shared/modList.ts` do. So this schema is main-only.
 */

import { z } from 'zod';

/**
 * The manifest format version Findias understands. A higher `schemaVersion` in a
 * manifest signals a breaking change Findias cannot safely read.
 */
export const MANIFEST_SCHEMA_VERSION = 1;

/** Canonical freshness values; unknown input degrades to `volatile`. */
export const updateTypeSchema = z.enum(['stable', 'volatile']).catch('volatile');
export type UpdateType = z.infer<typeof updateTypeSchema>;

/** One installable artifact. A non-variant mod has one; a group has one per variant. */
export const manifestVariantSchema = z.object({
  modId: z.string().min(1),
  modName: z.string().min(1),
  fileName: z.string().min(1),
  version: z.number().int().positive(),
  size: z.number().int().nonnegative(),
  updateType: updateTypeSchema,
  usedFiles: z.array(z.string()),
  modAuthor: z.string().min(1),
  modAdditionalCredits: z.string().min(1),
  recentUpdateNotes: z.string().min(1),
  // Optional docs (a newer producer may add them): the README markdown and
  // release-pinned image URLs. Absent on older manifests, so kept optional.
  readme: z.string().optional(),
  images: z.array(z.string()).optional(),
});

/** A catalog group. Every manifest entry is a group (a non-variant mod is a group of one). */
export const manifestGroupSchema = z.object({
  groupId: z.string().min(1),
  modName: z.string().min(1),
  // Lenient: tolerate tags this Findias build does not know about.
  findiasTags: z.array(z.string()),
  hasVariants: z.boolean(),
  mutuallyExclusive: z.boolean(),
  variants: z.array(manifestVariantSchema).min(1),
  // Optional group-level docs (a variant may override with its own).
  readme: z.string().optional(),
  images: z.array(z.string()).optional(),
});

/** Catalog-wide metadata; open to new top-level fields a newer producer may add. */
export const manifestMetadataSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    currentGameVersion: z.string().min(1),
    supportedGameVersion: z.string().min(1),
    generatedAt: z.string().min(1),
  })
  .passthrough();

/** The full release artifact: a metadata block plus the list of groups. */
export const manifestCatalogSchema = z.object({
  metadata: manifestMetadataSchema,
  modList: z.array(manifestGroupSchema),
});

export type ManifestVariant = z.infer<typeof manifestVariantSchema>;
export type ManifestGroup = z.infer<typeof manifestGroupSchema>;
export type ManifestMetadata = z.infer<typeof manifestMetadataSchema>;
export type ManifestCatalog = z.infer<typeof manifestCatalogSchema>;
