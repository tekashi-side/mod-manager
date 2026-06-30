import { useMemo, type FC } from 'react';
import { CircleAlert, CirclePause, Layers, PackageCheck, type LucideIcon } from 'lucide-react';
import type { ModGroupRow, ModStatus } from '@shared/modList';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/** The status-based filters offered alongside the text search. */
export type ModTab = 'all' | 'installed' | 'disabled' | 'orphaned';

/** Maps each non-"all" tab to the variant statuses that belong to it. */
const TAB_STATUS_MATCH: Record<Exclude<ModTab, 'all'>, (status: ModStatus) => boolean> = {
  installed: (status) => status === 'up-to-date' || status === 'update-available',
  disabled: (status) => status === 'disabled',
  orphaned: (status) => status === 'orphan',
};

/** The tabs in display order, with their labels. */
const TAB_ITEMS: readonly { value: ModTab; label: string }[] = [
  { value: 'all', label: 'All Mods' },
  { value: 'installed', label: 'Installed' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'orphaned', label: 'Orphaned' },
];

/** Presentation icons for each tab; mirrors the theme tabs in {@link SettingsView}. */
const TAB_ICONS: Record<ModTab, LucideIcon> = {
  all: Layers,
  installed: PackageCheck,
  disabled: CirclePause,
  orphaned: CircleAlert,
};

/** A group belongs to a tab when any of its variants matches that tab's statuses. */
export const groupMatchesTab = (group: ModGroupRow, tab: ModTab): boolean =>
  tab === 'all' || group.variants.some((variant) => TAB_STATUS_MATCH[tab](variant.status));

/** Narrow Radix's `string` onValueChange payload back to our tab union. */
const isModTab = (value: string): value is ModTab => TAB_ITEMS.some((item) => item.value === value);

type ModTabsProps = {
  value: ModTab;
  onValueChange: (tab: ModTab) => void;
  /** The full, unfiltered groups; per-status counts are derived from these. */
  groups: ModGroupRow[];
};

/**
 * The status filter tabs (All Mods / Installed / Disabled / Orphaned) shown above
 * the mod list. Counts are computed from the full group list so they reflect
 * per-status totals and stay stable as the text search narrows the visible rows.
 */
const ModTabs: FC<ModTabsProps> = ({ value, onValueChange, groups }) => {
  const counts = useMemo(
    () => ({
      all: groups.length,
      installed: groups.filter((g) => groupMatchesTab(g, 'installed')).length,
      disabled: groups.filter((g) => groupMatchesTab(g, 'disabled')).length,
      orphaned: groups.filter((g) => groupMatchesTab(g, 'orphaned')).length,
    }),
    [groups],
  );

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (isModTab(next)) onValueChange(next);
      }}
      className="shrink-0"
    >
      <TabsList className="w-full">
        {TAB_ITEMS.map((item) => {
          const Icon = TAB_ICONS[item.value];
          return (
            <TabsTrigger key={item.value} value={item.value}>
              <Icon className="size-4" />
              {item.label}
              <span className="tabular-nums text-muted-foreground">{counts[item.value]}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
};

export default ModTabs;
