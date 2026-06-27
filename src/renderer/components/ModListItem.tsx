import type { FC } from 'react';
import Box from '@mui/material/Box';
import Button, { type ButtonProps } from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { DownloadProgress } from '@shared/api';
import type { ModAction, ModVariantRow } from '@shared/modList';
import { formatBytes } from '../format';
import StatusChip from './StatusChip';

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

const actionStyle = (action: ModAction): Pick<ButtonProps, 'variant' | 'color'> => {
  if (action === 'delete') return { variant: 'outlined', color: 'error' };
  if (action === 'install' || action === 'update' || action === 'enable') {
    return { variant: 'contained', color: 'primary' };
  }
  return { variant: 'outlined', color: 'inherit' };
};

const versionSummary = (variant: ModVariantRow): string => {
  const release =
    variant.releaseVersion === null ? 'not in release' : `release v${variant.releaseVersion}`;
  const installed =
    variant.installedVersion === null ? 'not installed' : `installed v${variant.installedVersion}`;
  const size = variant.size === null ? '' : ` • ${formatBytes(variant.size)}`;
  return `${release} • ${installed}${size}`;
};

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
    <ListItem divider sx={{ flexWrap: 'wrap', gap: 1, py: 1.5 }}>
      <Stack sx={{ flexGrow: 1, minWidth: 0 }} spacing={0.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" sx={{ wordBreak: 'break-word' }}>
            {variant.name}
          </Typography>
          <StatusChip status={variant.status} />
        </Stack>

        {tags && tags.length > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
            {tags.map((tag) => (
              <Chip key={tag} size="small" variant="outlined" label={tag} />
            ))}
          </Stack>
        )}

        <Typography variant="body2" color="text.secondary">
          {versionSummary(variant)}
        </Typography>

        {showUpdateType && variant.updateType && (
          <Box>
            <Chip
              size="small"
              color={variant.updateType === 'volatile' ? 'warning' : 'success'}
              variant="filled"
              label={
                variant.updateType === 'volatile'
                  ? 'Volatile — likely affected by patches'
                  : 'Stable — usually survives patches'
              }
            />
          </Box>
        )}

        {variant.conflicts.length > 0 && (
          <Typography variant="body2" color="warning.main">
            Conflicts with {variant.conflicts.map((c) => c.modName).join(', ')}. Disable or delete
            it to enable this mod.
          </Typography>
        )}
      </Stack>

      <Stack direction="row" spacing={1}>
        {variant.actions.map((action) => (
          <Button
            key={action}
            size="small"
            disabled={busy}
            onClick={() => onAction(action, variant.modId)}
            {...actionStyle(action)}
          >
            {ACTION_LABEL[action]}
          </Button>
        ))}
      </Stack>

      {busy && (
        <Box sx={{ width: '100%' }}>
          {percent === null ? (
            <LinearProgress />
          ) : (
            <LinearProgress variant="determinate" value={percent} />
          )}
        </Box>
      )}
    </ListItem>
  );
};

export default ModListItem;
