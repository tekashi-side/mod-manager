import { useState, type FC } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ModGroupRow, ModVariantRow } from '@shared/modList';
import StatusChip from './StatusChip';
import { formatBytes } from '../format';
import { Badge } from '@/components/ui/badge';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

type ModDetailProps = {
  /** The selected variant, or null when nothing is selected. */
  variant: ModVariantRow | null;
  /** The selected variant's group, used for group-level doc fallback. */
  group: ModGroupRow | null;
};

/**
 * Utility classes that style rendered markdown (there is no typography plugin).
 * Applied to a wrapper so react-markdown's plain elements read as prose.
 */
const PROSE =
  'text-sm leading-relaxed break-words ' +
  '[&_h1]:mt-0 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold ' +
  '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold ' +
  '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold ' +
  '[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-semibold ' +
  '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 ' +
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 ' +
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 ' +
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs ' +
  '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 ' +
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 ' +
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground ' +
  '[&_table]:my-2 [&_table]:w-full [&_table]:text-left [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 ' +
  '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 ' +
  '[&_hr]:my-3 [&_hr]:border-border [&_img]:hidden';

/** Build the "release vX / installed vY / size" summary line for a variant. */
const versionSummary = (variant: ModVariantRow): string => {
  const release =
    variant.releaseVersion === null ? 'not in release' : `release v${variant.releaseVersion}`;
  const installed =
    variant.installedVersion === null ? 'not installed' : `installed v${variant.installedVersion}`;
  const size = variant.size === null ? '' : ` • ${formatBytes(variant.size)}`;
  return `${release} • ${installed}${size}`;
};

/** A single carousel image with its own loading skeleton and error fallback. */
const CarouselImage: FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');

  return (
    <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-lg bg-muted">
      {state === 'loading' && <Skeleton className="absolute inset-0 rounded-lg" />}
      {state === 'error' ? (
        <span className="px-4 text-center text-xs text-muted-foreground">Image unavailable</span>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className="h-full w-full object-contain transition-opacity duration-200"
          style={{ opacity: state === 'loaded' ? 1 : 0 }}
        />
      )}
    </div>
  );
};

/**
 * The detail pane for the selected mod: header metadata, an image carousel
 * (fixed height, per-slide loading, `object-contain` so mixed aspect ratios do
 * not reflow), and the rendered README markdown. README and images resolve from
 * the variant, falling back independently to the group's when the variant has
 * none. Images are rendered only in the carousel (hidden in the markdown).
 */
const ModDetail: FC<ModDetailProps> = ({ variant, group }) => {
  if (!variant) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No mod selected</EmptyTitle>
            <EmptyDescription>Select a mod to view its contents.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const readme = variant.readme ?? group?.readme;
  const images = variant.images ?? group?.images ?? [];

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold break-words">{variant.name}</h2>
            <StatusChip status={variant.status} />
          </div>

          <p className="text-sm text-muted-foreground">{versionSummary(variant)}</p>

          {(variant.modAuthor || variant.modAdditionalCredits) && (
            <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              {variant.modAuthor && (
                <span>
                  By <span className="text-foreground">{variant.modAuthor}</span>
                </span>
              )}
              {variant.modAdditionalCredits && variant.modAdditionalCredits !== 'None' && (
                <span>Credits: {variant.modAdditionalCredits}</span>
              )}
            </div>
          )}

          {variant.recentUpdateNotes && variant.recentUpdateNotes !== 'n/a' && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">Recent update</Badge>
              <span className="text-muted-foreground">{variant.recentUpdateNotes}</span>
            </div>
          )}
        </div>

        {images.length > 0 && (
          <Carousel className="w-full px-3" opts={{ align: 'start' }}>
            <CarouselContent>
              {images.map((src) => (
                <CarouselItem key={src}>
                  <CarouselImage src={src} alt={variant.name} />
                </CarouselItem>
              ))}
            </CarouselContent>
            {images.length > 1 && (
              <>
                <CarouselPrevious />
                <CarouselNext />
              </>
            )}
          </Carousel>
        )}

        {readme ? (
          <>
            <Separator />
            <div className={PROSE}>
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Images live in the carousel; links must not navigate the app
                  // shell (there is no external-open bridge), so they are inert.
                  img: () => null,
                  a: ({ children, href }) => (
                    <a href={href} onClick={(e) => e.preventDefault()}>
                      {children}
                    </a>
                  ),
                }}
              >
                {readme}
              </Markdown>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No description available for this mod.</p>
        )}
      </div>
    </ScrollArea>
  );
};

export default ModDetail;
