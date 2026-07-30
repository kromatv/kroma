import { type KromaClient, type MediaItem, type Show, sizedImageUrl } from '@kroma/core';
import { Box, gradient, Img, promote, SHADE, shade, tintGradient } from '@kroma/ui/kit';
import { useEffect, useState } from 'react';

// `value`, but only after it has held still for `delayMs`, so a fast D-pad
// sweep does not make the TV decode a backdrop per focus step.
function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (value === settled) return;
    const id = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(id);
  }, [value, settled, delayMs]);
  return settled;
}

const SETTLE_MS = 350;
const FADE_MS = 500;

// Two separate layers rather than one comma-separated background-image: a
// multi-value background is CSS-only, React Native's gradients cannot do it.
const VEIL_HORIZONTAL = `linear-gradient(90deg, ${shade(0.8)} 0%, ${shade(0.38)} 48%, ${shade(0.12)} 100%)`;
const VEIL_VERTICAL = `linear-gradient(0deg, ${SHADE.full} 0%, ${shade(0.78)} 30%, ${shade(0.35)} 68%, ${shade(0.12)} 100%)`;

/** Full-screen ambient art for the browse screens: the focused title's
 * backdrop, debounced then faded, dimmed by a veil so the poster grid stays
 * legible. Renders at `zIndex: -1` under the screen's own content. */
export function AmbientBackdrop({
  src,
  colors,
}: Readonly<{ src: string | null; colors: [string, string] }>) {
  const settled = useSettled(src, SETTLE_MS);
  return (
    <Box fill z={-1} overflow="hidden" pointerEvents="none" accessibilityElementsHidden>
      <Img
        // 960, not 1280: a television has ONE device pixel per CSS pixel and
        // this sits behind a grid and two veils, so it is never seen sharp.
        src={sizedImageUrl(settled, 960)}
        background={tintGradient(colors)}
        position="50% 20%"
        duration={FADE_MS}
        // A cross-fade here would have the TV compositing two 1080p images for
        // half a second on every focus move.
        noCrossFade
        fill
      />
      {/* Each veil on its own compositing layer (`translateZ(0)`): without it
          both 1920x1080 gradients re-rasterize on every frame of the fade. */}
      <Box fill pointerEvents="none" style={VEIL_H} />
      <Box fill pointerEvents="none" style={VEIL_V} />
    </Box>
  );
}

const VEIL_H = [gradient(VEIL_HORIZONTAL), promote()];
const VEIL_V = [gradient(VEIL_VERTICAL), promote()];

export type CatalogEntry = { kind: 'movie'; item: MediaItem } | { kind: 'show'; item: Show };

export function entryPoster(client: KromaClient, e: CatalogEntry): string {
  return e.kind === 'movie'
    ? client.posterFor(e.item, GRID_POSTER_W)
    : client.showPosterFor(e.item, GRID_POSTER_W);
}

// A browse-grid cell is 203pt wide on the 1920 stage; asking the server for a
// bucketed rendition is what keeps a 120-tile grid from stuttering on a TV.
const GRID_POSTER_W = 203;

/** The focused entry's backdrop, falling back to its poster. */
export function entryBackdrop(client: KromaClient, e: CatalogEntry | null): string | null {
  if (!e) return null;
  return client.backdropFor(e.item) ?? entryPoster(client, e);
}
