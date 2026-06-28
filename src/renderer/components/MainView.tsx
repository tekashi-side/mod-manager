import { useEffect, useState, type FC } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { DownloadProgress, SetupState } from '@shared/api';
import type { ModAction, ModListState } from '@shared/modList';
import ModList from './ModList';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Toaster } from '@/components/ui/sonner';

type MainViewProps = {
  setup: SetupState;
};

const MOD_LIST_KEY = ['modList'] as const;

/** Extract a user-facing message from an unknown thrown value, with a fallback. */
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'The action failed.';

/**
 * The primary screen once setup is valid: header with refresh, the prerelease
 * toggle, load/error/catalog banners, the scrollable mod list, and toast
 * notifications for failed install/update/delete/toggle actions.
 */
const MainView: FC<MainViewProps> = ({ setup }) => {
  const queryClient = useQueryClient();
  const [progressByMod, setProgressByMod] = useState<Record<string, DownloadProgress>>({});
  const [includePrereleases, setIncludePrereleases] = useState(setup.includePrereleases);
  const [outdatedDismissed, setOutdatedDismissed] = useState(false);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: MOD_LIST_KEY,
    queryFn: () => window.findias.refresh(),
  });

  useEffect(() => {
    return window.findias.onDownloadProgress((progress) => {
      setProgressByMod((prev) => ({ ...prev, [progress.modId]: progress }));
    });
  }, []);

  /** Drop the download-progress entry for a mod once its action settles. */
  const clearProgress = (modId: string): void =>
    setProgressByMod((prev) => {
      const next = { ...prev };
      delete next[modId];
      return next;
    });

  /** Prime the cached mod list with the fresh state returned by a mutation. */
  const seedModList = (state: ModListState): void => {
    queryClient.setQueryData(MOD_LIST_KEY, state);
  };

  const install = useMutation({
    mutationFn: (modId: string) => window.findias.installOrUpdate(modId),
    onSuccess: seedModList,
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: (_data, _error, modId) => clearProgress(modId),
  });

  const remove = useMutation({
    mutationFn: (modId: string) => window.findias.deleteMod(modId),
    onSuccess: seedModList,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const toggle = useMutation({
    mutationFn: ({ modId, disabled }: { modId: string; disabled: boolean }) =>
      window.findias.setDisabled(modId, disabled),
    onSuccess: seedModList,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const prerelease = useMutation({
    mutationFn: (value: boolean) => window.findias.setIncludePrereleases(value),
    onSuccess: seedModList,
    onError: (e) => toast.error(errorMessage(e)),
  });

  /** Optimistically reflect the prerelease toggle, then persist it. */
  const handlePrereleaseChange = (value: boolean): void => {
    setIncludePrereleases(value);
    prerelease.mutate(value);
  };

  /** Dispatch a row's action to the matching mutation. */
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
  const groups = data?.groups ?? [];
  const outdated = data?.metadata?.outdated ?? false;

  return (
    <div className="flex h-full">
      <div className="flex h-full w-[65%] min-w-0 flex-col gap-4 p-6">
        <div className="flex shrink-0 items-center gap-2">
          <h1 className="grow font-heading text-3xl font-semibold">Findias</h1>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching || busy}>
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <span className="text-xs break-all text-muted-foreground">{setup.gameRootPath}</span>
            <div className="flex items-center gap-2">
              <Switch
                id="include-prereleases"
                size="sm"
                checked={includePrereleases}
                onCheckedChange={handlePrereleaseChange}
                disabled={isFetching || busy}
              />
              <Label htmlFor="include-prereleases" className="font-normal text-muted-foreground">
                Include prereleases
              </Label>
            </div>
          </div>

          {isLoading && (
            <div className="flex shrink-0 justify-center py-12">
              <Spinner className="size-8" />
            </div>
          )}

          {isError && (
            <Alert variant="destructive" className="shrink-0">
              <AlertDescription>
                {error instanceof Error ? error.message : 'Failed to load the mod list.'}
              </AlertDescription>
              <AlertAction>
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  Retry
                </Button>
              </AlertAction>
            </Alert>
          )}

          {data && outdated && !outdatedDismissed && (
            <Alert className="shrink-0 border-amber-500/30 text-amber-700 dark:text-amber-400">
              <AlertDescription className="text-amber-700/90 dark:text-amber-400/90">
                New game patch ({data.metadata?.currentGameVersion}) — some mods may need updates.
              </AlertDescription>
              <AlertAction>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-amber-700/90 hover:text-amber-700 dark:text-amber-400/90 dark:hover:text-amber-400"
                  aria-label="Dismiss"
                  onClick={() => setOutdatedDismissed(true)}
                >
                  <X className="size-4" />
                </Button>
              </AlertAction>
            </Alert>
          )}

          {data && !data.catalog.available && (
            <Alert className="shrink-0 border-amber-500/30 text-amber-700 dark:text-amber-400">
              <AlertDescription className="text-amber-700/90 dark:text-amber-400/90">
                {data.catalog.error ?? 'The mod catalog is currently unavailable.'} Showing the mods
                already on disk.
              </AlertDescription>
            </Alert>
          )}

          {data && groups.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No mods to show</EmptyTitle>
                <EmptyDescription>
                  {data.catalog.available
                    ? 'No compatible mods were found in the latest Uiscias release.'
                    : 'No managed mods are installed.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {groups.length > 0 && (
            <ScrollArea className="-mr-3 min-h-0 flex-1">
              <div className="pr-3">
                <ModList
                  groups={groups}
                  busyModId={busyModId}
                  progressByMod={progressByMod}
                  outdated={outdated}
                  onAction={handleAction}
                />
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      <Separator orientation="vertical" />

      <div className="flex h-full w-[35%] min-w-0 items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No mod selected</EmptyTitle>
            <EmptyDescription>Select a mod to view its contents.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>

      <Toaster />
    </div>
  );
};

export default MainView;
