import { type KromaClient, type MediaItem, posterColors, type Show } from '@kroma/core';
import {
  Box,
  colors,
  gradient,
  Img,
  promote,
  SHADE,
  shade,
  tintGradient,
  useSettledValue,
} from '@kroma/ui/kit';
import { memo } from 'react';
import { useClient } from '#tv/app/router';
import { STAGE_W } from '#tv/shared/stage';

const SETTLE_MS = 400;
const FADE_MS = 500;

// Two separate layers rather than one comma-separated background-image: a
// multi-value background is CSS-only, React Native's gradients cannot do it.
const VEIL_HORIZONTAL = `linear-gradient(90deg, ${shade(0.8)} 0%, ${shade(0.38)} 48%, ${shade(0.12)} 100%)`;
const VEIL_VERTICAL = `linear-gradient(0deg, ${SHADE.full} 0%, ${shade(0.78)} 30%, ${shade(0.35)} 68%, ${shade(0.12)} 100%)`;

/** Full-screen ambient art for the browse screens: the focused title's
 * backdrop, held until the selection settles and then dissolved in, dimmed by
 * a veil so the poster grid stays legible. Renders at `zIndex: -1` under the
 * screen's own content. */
export function AmbientBackdrop({ entry }: Readonly<{ entry: CatalogEntry | null }>) {
  const client = useClient();
  const settled = useSettledValue(entry, SETTLE_MS);
  return (
    <Box fill z={-1} overflow="hidden" pointerEvents="none" accessibilityElementsHidden>
      <AmbientArt
        src={entryBackdrop(client, settled)}
        tint={tintGradient(settled ? posterColors(settled.item.id) : FALLBACK_TINT)}
      />
      {/* Each veil on its own compositing layer (`translateZ(0)`): without it
          both 1920x1080 gradients re-rasterize on every frame of the fade. */}
      <Box fill pointerEvents="none" style={VEIL_H} />
      <Box fill pointerEvents="none" style={VEIL_V} />
    </Box>
  );
}

function AmbientArtImpl({ src, tint }: Readonly<{ src: string | null; tint: string }>) {
  return <Img src={src} background={tint} position="50% 20%" duration={FADE_MS} fill />;
}

const AmbientArt = memo(AmbientArtImpl);

const VEIL_H = [gradient(VEIL_HORIZONTAL), promote()];
const VEIL_V = [gradient(VEIL_VERTICAL), promote()];

const FALLBACK_TINT: [string, string] = [colors.surface2, colors.bg];

export type CatalogEntry = { kind: 'movie'; item: MediaItem } | { kind: 'show'; item: Show };

export function entryPoster(client: KromaClient, e: CatalogEntry, width: number): string {
  return e.kind === 'movie' ? client.posterFor(e.item, width) : client.showPosterFor(e.item, width);
}

function entryBackdrop(client: KromaClient, e: CatalogEntry | null): string | null {
  if (!e) return null;
  return client.backdropFor(e.item, STAGE_W) ?? entryPoster(client, e, STAGE_W);
}
