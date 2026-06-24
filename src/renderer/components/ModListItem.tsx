import type { FC } from 'react';
import Box from '@mui/material/Box';
import Button, { type ButtonProps } from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { DownloadProgress } from '@shared/api';
import type { ModAction, ModRow } from '@shared/modList';
import StatusChip from './StatusChip';

type ModListItemProps = {
  row: ModRow;
  busy: boolean;
  progress?: DownloadProgress;
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

const versionSummary = (row: ModRow): string => {
  const release = row.releaseVersion === null ? 'not in release' : `release v${row.releaseVersion}`;
  const installed =
    row.installedVersion === null ? 'not installed' : `installed v${row.installedVersion}`;
  return `${release} • ${installed}`;
};

const ModListItem: FC<ModListItemProps> = ({ row, busy, progress, onAction }) => {
  const percent =
    progress && progress.totalBytes
      ? Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100))
      : null;

  return (
    <ListItem divider sx={{ flexWrap: 'wrap', gap: 1, py: 1.5 }}>
      <Stack sx={{ flexGrow: 1, minWidth: 0 }} spacing={0.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="subtitle1" sx={{ wordBreak: 'break-word' }}>
            {row.name}
          </Typography>
          <StatusChip status={row.status} />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {versionSummary(row)}
        </Typography>
      </Stack>

      <Stack direction="row" spacing={1}>
        {row.actions.map((action) => (
          <Button
            key={action}
            size="small"
            disabled={busy}
            onClick={() => onAction(action, row.modId)}
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
