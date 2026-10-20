import type { KromaClient } from '@kromatv/client';
import type { MediaItem, Show } from '@kromatv/client/media';
import { Box, Img, SHADE, shade, useSettledValue, Veil } from '@kromatv/ui/kit';
import { memo } from 'react';
import { useClient } from '#tv/app/router';
import { STAGE_W } from '#tv/shared/stage';

const SETTLE_MS = 400;
const FADE_MS = 500;

const VEIL_HORIZONTAL = `linear-gradient(90deg, ${shade(0.8)} 0%, ${shade(0.38)} 48%, ${shade(0.12)} 100%)`;
const VEIL_VERTICAL = `linear-gradient(0deg, ${SHADE.full} 0%, ${shade(0.78)} 30%, ${shade(0.35)} 68%, ${shade(0.12)} 100%)`;

/** Full-screen ambient art for the browse screens: the focused title's
 * backdrop, held until the selection settles and then dissolved in, dimmed by
 * a veil so the poster grid stays legible. Renders at `zIndex: -1` under the
 * screen's own content. */
export function AmbientBackdrop({ entry }: Readonly<{ entry: CatalogEntry | null }>) {
  const src = useAmbientSrc(entry);
  return (
    <Box fill z={-1} overflow="hidden" pointerEvents="none" accessibilityElementsHidden>
      <AmbientArt src={src} layered />
      <Veil ramp={VEIL} />
    </Box>
  );
}

/** The art and veil of {@link AmbientBackdrop} on no layer of their own, for a copy drawn inside a masked one. */
export function AmbientLayers({ entry }: Readonly<{ entry: CatalogEntry | null }>) {
  const src = useAmbientSrc(entry);
  return (
    <>
      <AmbientArt src={src} layered={false} />
      <Veil ramp={VEIL} />
    </>
  );
}

function useAmbientSrc(entry: CatalogEntry | null): string | null {
  const client = useClient();
  return entryBackdrop(client, useSettledValue(entry, SETTLE_MS));
}

function AmbientArtImpl({ src, layered }: Readonly<{ src: string | null; layered: boolean }>) {
  return <Img src={src} position="50% 20%" duration={FADE_MS} fill layered={layered} />;
}

const AmbientArt = memo(AmbientArtImpl);

const VEIL = `${VEIL_VERTICAL}, ${VEIL_HORIZONTAL}`;

export type CatalogEntry = { kind: 'movie'; item: MediaItem } | { kind: 'show'; item: Show };

export function entryPoster(client: KromaClient, e: CatalogEntry, width: number): string {
  return e.kind === 'movie'
    ? client.media.artwork.posterFor(e.item, width)
    : client.media.artwork.showPosterFor(e.item, width);
}

function entryBackdrop(client: KromaClient, e: CatalogEntry | null): string | null {
  if (!e) return null;
  return client.media.artwork.backdropFor(e.item, STAGE_W) ?? entryPoster(client, e, STAGE_W);
}
