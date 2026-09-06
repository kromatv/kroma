import {
  Box,
  backdropBlur,
  classes,
  sharedStyle,
  styles,
  Text,
  useBreakpoint,
} from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { useCrossfade } from '#web/shared/lib/use-crossfade';
import { Image } from '#web/shared/ui';
import { PAGE_GUTTER } from '#web/shared/ui/page';

const TITLE = styles({
  base: { fontSize: 36 },
  md: { fontSize: 40 },
  lg: { fontSize: 48 },
  tv: { fontSize: 56 },
});

export function BrowseTitle({ children }: Readonly<{ children: ReactNode }>) {
  const step = useBreakpoint();
  return (
    <Text variant="hero" accessibilityRole="header" style={TITLE[step]}>
      {children}
    </Text>
  );
}

const s = styles({
  band: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    mt: -36,
    minHeight: 'clamp(230px, 26vw, 340px)',
    pt: 64,
    pb: 20,
  },
  glow: {
    fill: true,
    pointerEvents: 'none',
    backgroundImage: [
      'radial-gradient(46% 95% at 12% 0%,',
      'color-mix(in srgb, var(--kroma-accent-wash) 17%, transparent), transparent 64%),',
      'radial-gradient(42% 85% at 88% 0%, rgba(96, 78, 214, 0.15), transparent 64%)',
    ].join(' '),
    maskImage: 'linear-gradient(90deg, transparent, #000 4rem)',
    WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 4rem)',
  },
  scrim: {
    backgroundImage: [
      'linear-gradient(90deg, var(--kroma-bg) 4%,',
      'color-mix(in srgb, var(--kroma-bg) 45%, transparent) 36%, transparent 66%),',
      'linear-gradient(0deg, var(--kroma-bg) 6%,',
      'color-mix(in srgb, var(--kroma-bg) 30%, transparent) 38%, transparent 64%)',
    ].join(' '),
  },
  breathe: {
    fill: true,
    pointerEvents: 'none',
    animationKeyframes: 'kroma-breathe',
    animationDuration: '7s',
    animationTimingFunction: 'var(--ease-out)',
    animationIterationCount: 'infinite',
    backgroundImage:
      'radial-gradient(58% 68% at 76% 28%, color-mix(in srgb, var(--kroma-accent-wash) 13%, transparent), transparent 62%)',
  },
  fadeIn: {
    fill: true,
    animationKeyframes: 'fade-in',
    animationDuration: '900ms',
    animationTimingFunction: 'var(--ease-out)',
  },
  credit: {
    position: 'absolute',
    bottom: 12,
    animationKeyframes: 'fade-in',
    animationDuration: '900ms',
    animationTimingFunction: 'var(--ease-out)',
  },
  countFrost: backdropBlur(4),
  tabular: { fontVariant: ['tabular-nums'] },
});

const bleed = (gutter: number) =>
  sharedStyle(`bleed:${gutter}`, {
    marginLeft: -gutter,
    marginRight: -gutter,
    paddingLeft: gutter,
    paddingRight: gutter,
  });

const creditAt = (gutter: number) => sharedStyle(`credit:${gutter}`, { right: gutter });

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
    <section className={classes(s.band, bleed(gutter))}>
      {backdrop ? (
        <>
          {prev ? <Image src={prev} fit="cover" position="center 22%" fill /> : null}
          <Box key={backdrop} style={s.fadeIn}>
            <Image src={backdrop} fit="cover" position="center 22%" fill />
          </Box>
          <Box fill pointerEvents="none" style={s.scrim} />
          <Box style={s.breathe} />
        </>
      ) : (
        <Box style={s.glow} />
      )}
      <Box>
        <Text variant="overline" color="accent" mb={10}>
          {eyebrow}
        </Text>
        <Box row wrap align="baseline" gapX={16} gapY={12}>
          <BrowseTitle>{heading}</BrowseTitle>
          {countText ? (
            <Box radius="pill" border="white/10" bg="black/30" px={16} py={6} style={s.countFrost}>
              <Text variant="meta" color="textMuted" style={s.tabular}>
                {countText}
              </Text>
            </Box>
          ) : null}
        </Box>
      </Box>
      {backdrop && creditTitle ? (
        <Box key={creditTitle} style={[s.credit, creditAt(gutter)]}>
          <Text variant="meta" color="white/35">
            {creditTitle}
          </Text>
        </Box>
      ) : null}
    </section>
  );
}
