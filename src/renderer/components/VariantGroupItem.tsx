import type { FC } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { DownloadProgress } from '@shared/api';
import type { ModAction, ModGroupRow } from '@shared/modList';
import ModListItem from './ModListItem';

type VariantGroupItemProps = {
  group: ModGroupRow;
  busyModId?: string;
  progressByMod: Record<string, DownloadProgress>;
  outdated: boolean;
  onAction: (action: ModAction, modId: string) => void;
};

/**
 * A mutually-exclusive variant group: a header (name + tags, no action buttons)
 * over an expandable list of variants. Only one variant may be installed at a
 * time; installing another auto-switches. The header has no buttons because all
 * actions belong to the individual variants.
 */
const VariantGroupItem: FC<VariantGroupItemProps> = ({
  group,
  busyModId,
  progressByMod,
  outdated,
  onAction,
}) => {
  const installed = group.variants.find((variant) => variant.modId === group.installedVariantId);

  return (
    <Accordion defaultExpanded disableGutters sx={{ '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<Box component="span">▾</Box>}>
        <Stack sx={{ flexGrow: 1, minWidth: 0 }} spacing={0.5}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" sx={{ wordBreak: 'break-word' }}>
              {group.name}
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              color="info"
              label={`${group.variants.length} variants`}
            />
          </Stack>

          {group.tags.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {group.tags.map((tag) => (
                <Chip key={tag} size="small" variant="outlined" label={tag} />
              ))}
            </Stack>
          )}

          <Typography variant="body2" color="text.secondary">
            {installed ? `Installed: ${installed.name}` : 'Pick one variant to install'}
          </Typography>
        </Stack>
      </AccordionSummary>

      <AccordionDetails sx={{ pt: 0 }}>
        <List disablePadding>
          {group.variants.map((variant) => (
            <ModListItem
              key={variant.modId}
              variant={variant}
              busy={variant.modId === busyModId}
              progress={progressByMod[variant.modId]}
              outdated={outdated}
              onAction={onAction}
            />
          ))}
        </List>
      </AccordionDetails>
    </Accordion>
  );
};

export default VariantGroupItem;
