import type { FC } from 'react';
import Chip, { type ChipProps } from '@mui/material/Chip';
import type { ModStatus } from '@shared/modList';

type StatusChipProps = {
  status: ModStatus;
};

const CONFIG: Record<ModStatus, { label: string; color: ChipProps['color'] }> = {
  'not-installed': { label: 'Not installed', color: 'default' },
  'up-to-date': { label: 'Up to date', color: 'success' },
  'update-available': { label: 'Update available', color: 'warning' },
  disabled: { label: 'Disabled', color: 'info' },
  orphan: { label: 'Not in release', color: 'default' },
};

const StatusChip: FC<StatusChipProps> = ({ status }) => {
  const { label, color } = CONFIG[status];
  return <Chip size="small" variant="outlined" label={label} color={color} />;
};

export default StatusChip;
