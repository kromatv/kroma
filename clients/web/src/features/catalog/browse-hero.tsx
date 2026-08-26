import { Box, backdropBlur, gradient, Text, useBreakpoint } from '@kroma/ui/kit';
import type { CSSProperties, ReactNode } from 'react';
import { useCrossfade } from '#web/shared/lib/use-crossfade';
import { Image } from '#web/shared/ui';
import { PAGE_GUTTER } from '#web/shared/ui/page';

const TITLE = {
  base: { fontSize: 36 },
  md: { fontSize: 40 },
  lg: { fontSize: 48 },
  tv: { fontSize: 56 },
} as const;

export function BrowseTitle({ children }: Readonly<{ children: ReactNode }>) {
  const step = useBreakpoint();
  return (
    <Text variant="hero" accessibilityRole="header" style={TITLE[step]}>
      {children}
    </Text>
  );
}

const BAND: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  overflow: 'hidden',
  marginTop: -36,
  minHeight: 'clamp(230px, 26vw, 340px)',
  paddingTop: 64,
  paddingBottom: 20,
};

const bleed = (gutter: number): CSSProperties => ({
  marginLeft: -gutter,
  marginRight: -gutter,
  paddingLeft: gutter,
  paddingRight: gutter,
});

const LAYER: CSSProperties = { position: 'absolute', inset: 0 };

const GLOW: CSSProperties = {
  ...LAYER,
  pointerEvents: 'none',
  background: [
    'radial-gradient(46% 95% at 12% 0%,',
    'color-mix(in srgb, var(--kroma-accent-wash) 17%, transparent), transparent 64%),',
    'radial-gradient(42% 85% at 88% 0%, rgba(96, 78, 214, 0.15), transparent 64%)',
  ].join(' '),
  maskImage: 'linear-gradient(90deg, transparent, #000 4rem)',
  WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 4rem)',
};

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
  animation: 'fade-in .9s var(--ease-out)',
};

const COUNT_FROST = backdropBlur(4);
const TABULAR = { fontVariant: ['tabular-nums' as const] };

export interface BrowseHeroProps {
  heading: string;
  eyebrow: string;
  countText?: string;
  backdrop?: string | null;
  creditTitle?: string;
}

export function BrowseHero({
  heading,
  eyebrow,
  countText,
  backdrop = null,
  creditTitle,
}: Readonly<BrowseHeroProps>) {
  const prev = useCrossfade(backdrop);
  const gutter = PAGE_GUTTER[useBreakpoint()];
  return (
    <section style={{ ...BAND, ...bleed(gutter) }}>
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
          <BrowseTitle>{heading}</BrowseTitle>
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
        <div key={creditTitle} style={{ ...CREDIT, right: gutter }}>
          <Text variant="meta" color="white/35">
            {creditTitle}
          </Text>
        </div>
      ) : null}
    </section>
  );
}
