import type {
  CatalogMetadata,
  ModAction,
  ModConflict,
  ModGroupRow,
  ModVariantRow,
} from '../shared/modList';
import type { Catalog, CatalogGroup, CatalogVariant } from './providers/catalog';
import type { InstalledMod } from './providers/installed';

/**
 * The resolver merges the grouped catalog with the installed-mods scan into the
 * grouped rows the UI renders. It depends only on the normalized interfaces,
 * never on GitHub or filesystem specifics. See docs/architecture.md
 * ("Mod resolution").
 */

export interface ResolvedModList {
  groups: ModGroupRow[];
  metadata: CatalogMetadata | null;
}

interface InstalledGroup {
  /** Highest-version enabled file for a modId (in package root), if any. */
  enabled?: InstalledMod;
  /** Highest-version disabled file for a modId (in package/disabled), if any. */
  disabled?: InstalledMod;
}

/** Actions that would result in a mod being enabled (loaded by the game). */
const ENABLING_ACTIONS: ReadonlySet<ModAction> = new Set<ModAction>([
  'install',
  'update',
  'enable',
]);

/**
 * Group installed files by modId, keeping the highest version seen for the
 * enabled and disabled locations separately. Duplicates (from a crashed update
 * or manual tinkering) collapse to the newest of each; the next mutation
 * reconciles the rest.
 */
const groupInstalledByModId = (installed: InstalledMod[]): Map<string, InstalledGroup> => {
  const groups = new Map<string, InstalledGroup>();
  for (const mod of installed) {
    const group = groups.get(mod.modId) ?? {};
    if (mod.enabled) {
      if (!group.enabled || mod.version > group.enabled.version) group.enabled = mod;
    } else if (!group.disabled || mod.version > group.disabled.version) {
      group.disabled = mod;
    }
    groups.set(mod.modId, group);
  }
  return groups;
};

/** Index every catalog variant by modId for O(1) lookups. */
const indexCatalogByModId = (
  catalog: Catalog,
): Map<string, { group: CatalogGroup; variant: CatalogVariant }> => {
  const index = new Map<string, { group: CatalogGroup; variant: CatalogVariant }>();
  for (const group of catalog.groups) {
    for (const variant of group.variants) index.set(variant.modId, { group, variant });
  }
  return index;
};

/**
 * Map each game file -> the currently-enabled, catalog-known mods that modify it.
 * Only enabled mods can actually conflict (the game loads only the package root),
 * and only catalog mods expose their `usedFiles`.
 */
const indexEnabledUsedFiles = (
  installedByModId: Map<string, InstalledGroup>,
  catalogIndex: Map<string, { group: CatalogGroup; variant: CatalogVariant }>,
): Map<string, ModConflict[]> => {
  const byFile = new Map<string, ModConflict[]>();
  for (const [modId, group] of installedByModId) {
    if (!group.enabled) continue;
    const found = catalogIndex.get(modId);
    if (!found) continue;
    const conflict: ModConflict = { modId, modName: found.variant.modName };
    for (const file of found.variant.usedFiles) {
      const list = byFile.get(file) ?? [];
      list.push(conflict);
      byFile.set(file, list);
    }
  }
  return byFile;
};

/**
 * Collect the enabled mods that conflict with `variant`, excluding same-group
 * siblings (a mutually-exclusive switch handles those) and the variant itself.
 */
const conflictsFor = (
  variant: CatalogVariant,
  siblingIds: ReadonlySet<string>,
  enabledByFile: Map<string, ModConflict[]>,
): ModConflict[] => {
  const byModId = new Map<string, ModConflict>();
  for (const file of variant.usedFiles) {
    for (const conflict of enabledByFile.get(file) ?? []) {
      if (siblingIds.has(conflict.modId)) continue;
      byModId.set(conflict.modId, conflict);
    }
  }
  return [...byModId.values()];
};

/** Compute the row for a single catalog variant. */
const buildVariantRow = (
  variant: CatalogVariant,
  installedGroup: InstalledGroup | undefined,
  conflicts: ModConflict[],
): ModVariantRow => {
  const enabled = installedGroup?.enabled;
  const disabled = installedGroup?.disabled;
  const primary = enabled ?? disabled;

  let status: ModVariantRow['status'];
  let actions: ModAction[];

  if (!primary) {
    status = 'not-installed';
    actions = ['install'];
  } else if (!enabled && disabled) {
    status = 'disabled';
    actions =
      disabled.version < variant.version ? ['enable', 'update', 'delete'] : ['enable', 'delete'];
  } else if (primary.version < variant.version) {
    status = 'update-available';
    actions = ['update', 'disable', 'delete'];
  } else {
    status = 'up-to-date';
    actions = ['disable', 'delete'];
  }

  // A conflict with an already-enabled mod blocks anything that would enable
  // this one. Disable/delete remain so the user can resolve the conflict.
  if (conflicts.length > 0) {
    actions = actions.filter((action) => !ENABLING_ACTIONS.has(action));
  }

  return {
    modId: variant.modId,
    name: variant.modName,
    status,
    releaseVersion: variant.version,
    installedVersion: primary?.version ?? null,
    size: variant.size,
    fileName: variant.fileName,
    updateType: variant.updateType,
    actions,
    conflicts,
  };
};

/** Build a delete-only row for an installed mod absent from the catalog. */
const buildOrphanGroup = (modId: string, installedGroup: InstalledGroup): ModGroupRow => {
  const primary = installedGroup.enabled ?? installedGroup.disabled;
  const variant: ModVariantRow = {
    modId,
    name: modId,
    status: 'orphan',
    releaseVersion: null,
    installedVersion: primary?.version ?? null,
    size: null,
    fileName: primary?.fileName ?? null,
    updateType: null,
    actions: ['delete'],
    conflicts: [],
  };
  return {
    groupId: modId,
    name: modId,
    tags: [],
    hasVariants: false,
    mutuallyExclusive: false,
    installedVariantId: modId,
    variants: [variant],
  };
};

/** Pick the installed variant of a group (preferring the enabled location). */
const installedVariantId = (
  group: CatalogGroup,
  installedByModId: Map<string, InstalledGroup>,
): string | null => {
  let disabledMatch: string | null = null;
  for (const variant of group.variants) {
    const installed = installedByModId.get(variant.modId);
    if (installed?.enabled) return variant.modId;
    if (installed?.disabled && disabledMatch === null) disabledMatch = variant.modId;
  }
  return disabledMatch;
};

/**
 * Merge the grouped catalog and the installed-mods scan into grouped rows, plus
 * catalog-wide metadata. Pure and deterministic. When `catalog` is null (the
 * fetch failed), every installed mod is returned as an orphan group and
 * `metadata` is null.
 */
export const resolveModList = (
  catalog: Catalog | null,
  installed: InstalledMod[],
): ResolvedModList => {
  const installedByModId = groupInstalledByModId(installed);

  if (!catalog) {
    const groups = [...installedByModId.entries()].map(([modId, group]) =>
      buildOrphanGroup(modId, group),
    );
    return { groups: groups.sort((a, b) => a.name.localeCompare(b.name)), metadata: null };
  }

  const catalogIndex = indexCatalogByModId(catalog);
  const enabledByFile = indexEnabledUsedFiles(installedByModId, catalogIndex);

  const groups: ModGroupRow[] = catalog.groups.map((group) => {
    const siblingIds = new Set(group.variants.map((variant) => variant.modId));
    const variants = group.variants.map((variant) =>
      buildVariantRow(
        variant,
        installedByModId.get(variant.modId),
        conflictsFor(variant, siblingIds, enabledByFile),
      ),
    );
    return {
      groupId: group.groupId,
      name: group.modName,
      tags: group.findiasTags,
      hasVariants: group.hasVariants,
      mutuallyExclusive: group.mutuallyExclusive,
      installedVariantId: installedVariantId(group, installedByModId),
      variants,
    };
  });

  // Installed mods with no catalog variant become delete-only orphan groups.
  for (const [modId, installedGroup] of installedByModId) {
    if (!catalogIndex.has(modId)) groups.push(buildOrphanGroup(modId, installedGroup));
  }

  const metadata: CatalogMetadata = {
    ...catalog.metadata,
    outdated: catalog.metadata.supportedGameVersion !== catalog.metadata.currentGameVersion,
  };

  return { groups: groups.sort((a, b) => a.name.localeCompare(b.name)), metadata };
};
