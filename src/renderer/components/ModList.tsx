import type { FC } from 'react';
import List from '@mui/material/List';
import type { DownloadProgress } from '@shared/api';
import type { ModAction, ModGroupRow } from '@shared/modList';
import ModListItem from './ModListItem';
import VariantGroupItem from './VariantGroupItem';

type ModListProps = {
  groups: ModGroupRow[];
  busyModId?: string;
  progressByMod: Record<string, DownloadProgress>;
  outdated: boolean;
  onAction: (action: ModAction, modId: string) => void;
};

const ModList: FC<ModListProps> = ({ groups, busyModId, progressByMod, outdated, onAction }) => {
  return (
    <List disablePadding>
      {groups.map((group) =>
        group.hasVariants ? (
          <VariantGroupItem
            key={group.groupId}
            group={group}
            busyModId={busyModId}
            progressByMod={progressByMod}
            outdated={outdated}
            onAction={onAction}
          />
        ) : (
          <ModListItem
            key={group.groupId}
            variant={group.variants[0]}
            tags={group.tags}
            busy={group.variants[0].modId === busyModId}
            progress={progressByMod[group.variants[0].modId]}
            outdated={outdated}
            onAction={onAction}
          />
        ),
      )}
    </List>
  );
};

export default ModList;
