import { Box, backdropBlur, gradient, Text } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';
import { useCrossfade } from '#web/shared/lib/use-crossfade';
import { Image } from '#web/shared/ui';

/** The browse pages' display title, shared with the routes' pending headers so
 * the skeleton does not jump on settle. */
export const BROWSE_TITLE = 'browse-title';

// Bled to the content edges: the gutter is a fluid CSS custom property, which
// no style number can carry, so the band stays a plain element.
const BAND: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  overflow: 'hidden',
  marginLeft: 'calc(var(--gutter-web) * -1)',
  marginRight: 'calc(var(--gutter-web) * -1)',
  marginTop: -36,
  minHeight: 'clamp(230px, 26vw, 340px)',
  paddingLeft: 'var(--gutter-web)',
  paddingRight: 'var(--gutter-web)',
  paddingTop: 64,
  paddingBottom: 20,
};

const LAYER: CSSProperties = { position: 'absolute', inset: 0 };

// No-artwork fallback: the two-tone amber/violet wash, eased in from the left
// so nothing hard-clips at the sidebar seam.
const GLOW: CSSProperties = {
  ...LAYER,
  pointerEvents: 'none',
  background: [
    'radial-gradient(46% 95% at 12% 0%,',
    'color-mix(in srgb, var(--kroma-accent-wash) 17%, transparent), transparent 64%),',
    // A violet the palette has no token for; kept as authored.
    'radial-gradient(42% 85% at 88% 0%, rgba(96, 78, 214, 0.15), transparent 64%)',
  ].join(' '),
  maskImage: 'linear-gradient(90deg, transparent, #000 4rem)',
  WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 4rem)',
};

// Near-opaque bg at the left and bottom edges: the left hides the sidebar
// seam, the bottom hands the artwork off to the toolbar and grid below.
const SCRIM = gradient(
  [
    'linear-gradient(90deg, var(--kroma-bg) 4%,',
    'color-mix(in srgb, var(--kroma-bg) 45%, transparent) 36%, transparent 66%),',
    'linear-gradient(0deg, var(--kroma-bg) 6%,',
    'color-mix(in srgb, var(--kroma-bg) 30%, transparent) 38%, transparent 64%)',
  ].join(' '),
);

const BREATHE: CSSProperties = {
  ...LAYER,
  pointerEvents: 'none',
  animation: 'kroma-breathe 7s var(--ease-out) infinite',
  background:
    'radial-gradient(58% 68% at 76% 28%, color-mix(in srgb, var(--kroma-accent-wash) 13%, transparent), transparent 62%)',
};

const FADE_IN: CSSProperties = { ...LAYER, animation: 'fade-in .9s var(--ease-out)' };

const CREDIT: CSSProperties = {
  position: 'absolute',
  bottom: 12,
  right: 'var(--gutter-web)',
  animation: 'fade-in .9s var(--ease-out)',
};

const COUNT_FROST = backdropBlur(4);
const TABULAR = { fontVariant: ['tabular-nums' as const] };

export interface BrowseHeroProps {
  heading: string;
  /** Small amber label over the title: the active genre, or the library. */
  eyebrow: string;
  countText?: string;
  /** Backdrop of the view's current featured title; without one the hero
   *  falls back to an ambient wash. */
  backdrop?: string | null;
  /** Which title the artwork belongs to, named in the corner. */
  creditTitle?: string;
}

/** The cinematic band opening a catalogue page: the current view's own
 * artwork bled edge to edge behind the page title, crossfading as the caller
 * rotates through its featured titles, so filtering visibly repaints the page
 * with what it found. */
export function BrowseHero({
  heading,
  eyebrow,
  countText,
  backdrop = null,
  creditTitle,
}: Readonly<BrowseHeroProps>) {
  const prev = useCrossfade(backdrop);
  return (
    <section style={BAND}>
      {backdrop ? (
        <>
          {prev ? <Image src={prev} fit="cover" position="center 22%" fill /> : null}
          <div key={backdrop} style={FADE_IN}>
            <Image src={backdrop} fit="cover" position="center 22%" fill />
          </div>
          <Box fill pointerEvents="none" style={SCRIM} />
          <div style={BREATHE} />
        </>
      ) : (
        <div style={GLOW} />
      )}
      <Box>
        <Text variant="overline" color="accent" mb={10}>
          {eyebrow}
        </Text>
        <Box row wrap align="baseline" gapX={16} gapY={12}>
          <h1 className={BROWSE_TITLE}>{heading}</h1>
          {countText ? (
            <Box radius="pill" border="white/10" bg="black/30" px={16} py={6} style={COUNT_FROST}>
              <Text variant="meta" color="textMuted" style={TABULAR}>
                {countText}
              </Text>
            </Box>
          ) : null}
        </Box>
      </Box>
      {backdrop && creditTitle ? (
        <div key={creditTitle} style={CREDIT}>
          <Text variant="meta" color="white/35">
            {creditTitle}
          </Text>
        </div>
      ) : null}
    </section>
  );
}
