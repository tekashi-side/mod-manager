import type { FC } from 'react';
import List from '@mui/material/List';
import type { DownloadProgress } from '@shared/api';
import type { ModAction, ModRow } from '@shared/modList';
import ModListItem from './ModListItem';

type ModListProps = {
  rows: ModRow[];
  busyModId?: string;
  progressByMod: Record<string, DownloadProgress>;
  onAction: (action: ModAction, modId: string) => void;
};

const ModList: FC<ModListProps> = ({ rows, busyModId, progressByMod, onAction }) => {
  return (
    <List disablePadding>
      {rows.map((row) => (
        <ModListItem
          key={row.modId}
          row={row}
          busy={row.modId === busyModId}
          progress={progressByMod[row.modId]}
          onAction={onAction}
        />
      ))}
    </List>
  );
};

export default ModList;
