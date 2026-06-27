import { useEffect, useState, type FC } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import type { DownloadProgress, SetupState } from '@shared/api';
import type { ModAction, ModListState } from '@shared/modList';
import ModList from './ModList';

type MainViewProps = {
  setup: SetupState;
};

const MOD_LIST_KEY = ['modList'] as const;

const MainView: FC<MainViewProps> = ({ setup }) => {
  const queryClient = useQueryClient();
  const [progressByMod, setProgressByMod] = useState<Record<string, DownloadProgress>>({});
  const [includePrereleases, setIncludePrereleases] = useState(setup.includePrereleases);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: MOD_LIST_KEY,
    queryFn: () => window.findias.refresh(),
  });

  useEffect(() => {
    return window.findias.onDownloadProgress((progress) => {
      setProgressByMod((prev) => ({ ...prev, [progress.modId]: progress }));
    });
  }, []);

  const clearProgress = (modId: string): void =>
    setProgressByMod((prev) => {
      const next = { ...prev };
      delete next[modId];
      return next;
    });

  const seedModList = (state: ModListState): void => {
    queryClient.setQueryData(MOD_LIST_KEY, state);
  };

  const install = useMutation({
    mutationFn: (modId: string) => window.findias.installOrUpdate(modId),
    onSuccess: seedModList,
    onSettled: (_data, _error, modId) => clearProgress(modId),
  });

  const remove = useMutation({
    mutationFn: (modId: string) => window.findias.deleteMod(modId),
    onSuccess: seedModList,
  });

  const toggle = useMutation({
    mutationFn: ({ modId, disabled }: { modId: string; disabled: boolean }) =>
      window.findias.setDisabled(modId, disabled),
    onSuccess: seedModList,
  });

  const prerelease = useMutation({
    mutationFn: (value: boolean) => window.findias.setIncludePrereleases(value),
    onSuccess: seedModList,
  });

  const handlePrereleaseChange = (value: boolean): void => {
    setIncludePrereleases(value);
    prerelease.mutate(value);
  };

  const handleAction = (action: ModAction, modId: string): void => {
    if (action === 'delete') remove.mutate(modId);
    else if (action === 'enable') toggle.mutate({ modId, disabled: false });
    else if (action === 'disable') toggle.mutate({ modId, disabled: true });
    else install.mutate(modId);
  };

  const busyModId = install.isPending
    ? install.variables
    : remove.isPending
      ? remove.variables
      : toggle.isPending
        ? toggle.variables.modId
        : undefined;

  const busy = Boolean(busyModId) || prerelease.isPending;
  const mutationError = install.error ?? remove.error ?? toggle.error ?? prerelease.error;
  const groups = data?.groups ?? [];
  const outdated = data?.metadata?.outdated ?? false;

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            Findias
          </Typography>
          <Button variant="outlined" onClick={() => void refetch()} disabled={isFetching || busy}>
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
            {setup.gameRootPath}
          </Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={includePrereleases}
                onChange={(event) => handlePrereleaseChange(event.target.checked)}
                disabled={isFetching || busy}
              />
            }
            label="Include prereleases"
            slotProps={{ typography: { variant: 'body2' } }}
          />
        </Stack>

        {isLoading && (
          <Stack sx={{ alignItems: 'center', py: 6 }}>
            <CircularProgress />
          </Stack>
        )}

        {isError && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void refetch()}>
                Retry
              </Button>
            }
          >
            {error instanceof Error ? error.message : 'Failed to load the mod list.'}
          </Alert>
        )}

        {mutationError && (
          <Alert severity="error">
            {mutationError instanceof Error ? mutationError.message : 'The action failed.'}
          </Alert>
        )}

        {data && outdated && (
          <Alert severity="warning">
            The mod catalog is verified for game version {data.metadata?.supportedGameVersion}, but
            the latest client is {data.metadata?.currentGameVersion}. Some mods may be out of date —
            consider disabling volatile mods until they are updated.
          </Alert>
        )}

        {data && !data.catalog.available && (
          <Alert severity="warning">
            {data.catalog.error ?? 'The mod catalog is currently unavailable.'} Showing the mods
            already on disk.
          </Alert>
        )}

        {data && groups.length === 0 && (
          <Alert severity="info">
            {data.catalog.available
              ? 'No compatible mods were found in the latest Uiscias release.'
              : 'No managed mods are installed.'}
          </Alert>
        )}

        {groups.length > 0 && (
          <Box sx={{ maxHeight: 420, overflowY: 'auto', pr: 1 }}>
            <ModList
              groups={groups}
              busyModId={busyModId}
              progressByMod={progressByMod}
              outdated={outdated}
              onAction={handleAction}
            />
          </Box>
        )}
      </Stack>
    </Container>
  );
};

export default MainView;
