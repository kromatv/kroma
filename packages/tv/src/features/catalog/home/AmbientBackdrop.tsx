import { type KromaClient, type MediaItem, type Show, sizedImageUrl } from '@kroma/core';
import { Box, gradient, Img, promote, SHADE, shade, tintGradient } from '@kroma/ui/kit';
import { useEffect, useState } from 'react';

/** `value`, but only after it has held still for `delayMs`. Lets a fast D-pad
 * sweep across a poster row settle before the full-screen art swaps, so the TV
 * never decodes a 1280px backdrop per focus step. */
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

// Darkest bottom-left (title + grid zones), art shows through top-right: the
// Disney+ browse look. Two separate layers rather than one comma-separated
// background-image, because a multi-value background is a CSS-only luxury that
// React Native's gradient support does not have.
const VEIL_HORIZONTAL = `linear-gradient(90deg, ${shade(0.8)} 0%, ${shade(0.38)} 48%, ${shade(0.12)} 100%)`;
const VEIL_VERTICAL = `linear-gradient(0deg, ${SHADE.full} 0%, ${shade(0.78)} 30%, ${shade(0.35)} 68%, ${shade(0.12)} 100%)`;

/**
 * Full-screen ambient art for the browse screens: the focused title's backdrop,
 * debounced then cross-faded, dimmed by a veil so the poster grid stays legible.
 * Renders at `zIndex: -1` under the screen's own content.
 *
 * The cross-fade is <Img>'s own: it holds the previous art underneath until the
 * incoming one has decoded, then fades over it. That replaces the hand-rolled
 * two-layer stack this component used to carry, and it also fixes the bug that
 * stack existed to work around: the old fade was a CSS keyframe with `both`, and
 * an occluded window can skip animation frames entirely, leaving the layer stuck
 * invisible. A transition (web) and an Animated value (native) both settle on
 * their final value regardless of whether any frame was ever painted.
 */
export function AmbientBackdrop({
  src,
  colors,
}: Readonly<{ src: string | null; colors: [string, string] }>) {
  const settled = useSettled(src, SETTLE_MS);
  return (
    <Box fill z={-1} overflow="hidden" pointerEvents="none" accessibilityElementsHidden>
      <Img
        // 960, not 1280: this fills the whole 1920 stage but sits behind a poster
        // grid and two dimming veils, so it is never seen sharp - and a
        // television has ONE device pixel per CSS pixel, so 1280 was already
        // asking for more than the panel can show. Halving the width quarters the
        // pixels the TV decodes on every backdrop swap, which is what the browse
        // grid does on every focus move.
        src={sizedImageUrl(settled, 960)}
        background={tintGradient(colors)}
        position="50% 20%"
        duration={FADE_MS}
        // The one place a cross-fade is pure cost: a full-screen decorative layer
        // that swaps constantly. Holding the previous backdrop under the incoming
        // one meant the TV composited two 1080p images for half a second on every
        // move. It still fades in; there is just no second layer.
        noCrossFade
        fill
      />
      {/* Each veil on its OWN compositing layer (`translateZ(0)`).
          A full-screen gradient is expensive to RASTERIZE on a TV GPU, and these
          two sit right above a backdrop that fades on every focus move - so
          without this the browser re-rasterized both 1920x1080 gradients on every
          frame of every fade, which measured as the browse grid's worst stutter.
          Promoted, each gradient is rasterized ONCE into a texture and the fade
          underneath only re-composites it: on the panel, ~185 -> ~307 painted
          frames across the same walk. */}
      <Box fill pointerEvents="none" style={VEIL_H} />
      <Box fill pointerEvents="none" style={VEIL_V} />
    </Box>
  );
}

/** A veil on its own compositing layer (see `promote`), so the backdrop fading
 * beneath it does not re-rasterize the gradient every frame. */
const VEIL_H = [gradient(VEIL_HORIZONTAL), promote()];
const VEIL_V = [gradient(VEIL_VERTICAL), promote()];

// ----- the art one catalogue entry contributes -------------------------------

/** One browse entry, a film or a series, with the fields the grids and the art
 * helpers below read. Shared by every screen that lists both kinds at once. */
export type CatalogEntry = { kind: 'movie'; item: MediaItem } | { kind: 'show'; item: Show };

/** The entry's poster (films and series resolve theirs from different endpoints). */
export function entryPoster(client: KromaClient, e: CatalogEntry): string {
  return e.kind === 'movie'
    ? client.posterFor(e.item, GRID_POSTER_W)
    : client.showPosterFor(e.item, GRID_POSTER_W);
}

/** A browse-grid cell is 203pt wide on the 1920 stage. Asking the server for
 * that instead of the full-size original is what keeps a 120-tile grid from
 * stuttering on a television: the rendition is bucketed and cached on disk. */
const GRID_POSTER_W = 203;

/** The ambient art for the focused entry: its backdrop, falling back to its
 * poster, and nothing at all when the view is empty. One spelling of the chain
 * so every browse screen shows the same picture for the same title. */
export function entryBackdrop(client: KromaClient, e: CatalogEntry | null): string | null {
  if (!e) return null;
  return client.backdropFor(e.item) ?? entryPoster(client, e);
}
