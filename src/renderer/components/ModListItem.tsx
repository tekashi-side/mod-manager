import type { FC } from 'react';
import { Info } from 'lucide-react';
import type { DownloadProgress } from '@shared/api';
import type { ModAction, ModVariantRow } from '@shared/modList';
import { formatBytes } from '../format';
import StatusChip from './StatusChip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from '@/components/ui/item';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

type ModListItemProps = {
  variant: ModVariantRow;
  /** Group tags to display above the row (omitted for variant sub-rows). */
  tags?: string[];
  busy: boolean;
  progress?: DownloadProgress;
  /** When true, the catalog banner is active, so the updateType chip is shown. */
  outdated: boolean;
  onAction: (action: ModAction, modId: string) => void;
};

const ACTION_LABEL: Record<ModAction, string> = {
  install: 'Install',
  update: 'Update',
  enable: 'Enable',
  disable: 'Disable',
  delete: 'Delete',
};

type ButtonVariant = 'default' | 'outline' | 'destructive';

/** Map a mod action to the shadcn button variant that conveys its intent. */
const actionVariant = (action: ModAction): ButtonVariant => {
  if (action === 'delete') return 'destructive';
  if (action === 'install' || action === 'update' || action === 'enable') return 'default';
  return 'outline';
};

/** Build the one-line "release vX • installed vY • size" summary for a variant. */
const versionSummary = (variant: ModVariantRow): string => {
  const release =
    variant.releaseVersion === null ? 'not in release' : `release v${variant.releaseVersion}`;
  const installed =
    variant.installedVersion === null ? 'not installed' : `installed v${variant.installedVersion}`;
  const size = variant.size === null ? '' : ` • ${formatBytes(variant.size)}`;
  return `${release} • ${installed}${size}`;
};

/**
 * A single mod/variant row: name, status, version summary, optional tags and
 * conflict notes, action buttons (Delete behind an {@link AlertDialog} confirm),
 * and a determinate/indeterminate progress bar while an action is in flight.
 */
const ModListItem: FC<ModListItemProps> = ({
  variant,
  tags,
  busy,
  progress,
  outdated,
  onAction,
}) => {
  const percent =
    progress && progress.totalBytes
      ? Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100))
      : null;

  const showUpdateType = outdated && variant.updateType !== null;

  return (
    <Item variant="outline" className="items-start">
      <ItemContent>
        <ItemTitle className="flex-wrap break-words">
          <span className="break-words">{variant.name}</span>
          <StatusChip status={variant.status} />
        </ItemTitle>

        {((showUpdateType && variant.updateType) || (tags && tags.length > 0)) && (
          <div className="flex flex-wrap gap-1">
            {showUpdateType && variant.updateType && (
              <Badge
                variant="outline"
                className={cn(
                  'gap-1',
                  variant.updateType === 'volatile'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                )}
              >
                {variant.updateType === 'volatile' ? 'Volatile' : 'Stable'}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex cursor-help items-center opacity-70 hover:opacity-100"
                      aria-label={
                        variant.updateType === 'volatile'
                          ? 'Volatile mods are likely affected by patches'
                          : 'Stable mods usually survive patches'
                      }
                    >
                      <Info className="size-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {variant.updateType === 'volatile'
                      ? 'Likely affected by patches'
                      : 'Usually survives patches'}
                  </TooltipContent>
                </Tooltip>
              </Badge>
            )}
            {tags?.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <ItemDescription>{versionSummary(variant)}</ItemDescription>

        {variant.conflicts.length > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Conflicts with {variant.conflicts.map((c) => c.modName).join(', ')}. Disable or delete
            it to enable this mod.
          </p>
        )}
      </ItemContent>

      <ItemActions>
        {variant.actions.map((action) =>
          action === 'delete' ? (
            <AlertDialog key={action}>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" disabled={busy}>
                  {ACTION_LABEL[action]}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {variant.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the mod file from your package folder. You can reinstall it later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => onAction('delete', variant.modId)}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              key={action}
              size="sm"
              variant={actionVariant(action)}
              disabled={busy}
              onClick={() => onAction(action, variant.modId)}
            >
              {ACTION_LABEL[action]}
            </Button>
          ),
        )}
      </ItemActions>

      {busy && (
        <ItemFooter>
          {percent === null ? (
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-full animate-pulse rounded-full bg-primary/60" />
            </div>
          ) : (
            <Progress value={percent} />
          )}
        </ItemFooter>
      )}
    </Item>
  );
};

export default ModListItem;
