import { useState, type FC } from 'react';
import { ChevronDown } from 'lucide-react';
import type { DownloadProgress } from '@shared/api';
import type { ModAction, ModGroupRow } from '@shared/modList';
import ModListItem from './ModListItem';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import { cn } from '@/lib/utils';

type VariantGroupItemProps = {
  group: ModGroupRow;
  busyModId?: string;
  progressByMod: Record<string, DownloadProgress>;
  outdated: boolean;
  onAction: (action: ModAction, modId: string) => void;
};

/**
 * A mutually-exclusive variant group rendered as a collapsible {@link Item}: the
 * header (name + tags, no action buttons) toggles an expandable list of variant
 * rows. Collapsed by default so groups stay compact. Only one variant may be
 * installed at a time; installing another auto-switches. The header has no
 * buttons because all actions belong to the individual variants.
 */
const VariantGroupItem: FC<VariantGroupItemProps> = ({
  group,
  busyModId,
  progressByMod,
  outdated,
  onAction,
}) => {
  const [open, setOpen] = useState(false);
  const installed = group.variants.find((variant) => variant.modId === group.installedVariantId);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Item variant="outline" className="cursor-pointer items-start select-none">
          <ItemContent>
            <ItemTitle className="flex-wrap break-words">
              <span className="break-words">{group.name}</span>
              <Badge variant="outline" className="border-sky-500/30 text-sky-700 dark:text-sky-400">
                {group.variants.length} variants
              </Badge>
            </ItemTitle>

            {group.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {group.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            <ItemDescription>
              {installed ? `Installed: ${installed.name}` : 'Pick one variant to install'}
            </ItemDescription>
          </ItemContent>

          <ItemActions>
            <ChevronDown
              className={cn('size-4 transition-transform duration-200', open && 'rotate-180')}
            />
          </ItemActions>
        </Item>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ItemGroup className="gap-2 pt-2.5 pl-4">
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
        </ItemGroup>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default VariantGroupItem;
