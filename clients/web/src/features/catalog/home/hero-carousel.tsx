import { posterColors } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, classes, styles, useStyles } from '@kromatv/ui/kit';
import { type KeyboardEvent, useState } from 'react';
import { entryBackdrop, entryId, type HomeSection } from '#web/features/catalog/home/entries';
import { HeroPager } from '#web/features/catalog/home/hero-pager';
import { HeroSlide } from '#web/features/catalog/home/hero-slide';
import { useCarousel } from '#web/features/catalog/home/use-carousel';
import { useAuth } from '#web/shared/lib/auth';
import { useCrossfade } from '#web/shared/lib/use-crossfade';
import { useReducedMotion } from '#web/shared/lib/use-reduced-motion';
import { Image } from '#web/shared/ui';

const BACKDROP_W = 1280;

const sDefinition = styles({
  hero: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginLeft: 'calc(var(--gutter-web) * -1)',
    marginRight: 'calc(var(--gutter-web) * -1)',
    mt: -36,
    mb: 8,
    minHeight: 'clamp(420px, 58vw, 680px)',
    paddingLeft: 'var(--gutter-web)',
    paddingRight: 'var(--gutter-web)',
    paddingTop: 'clamp(72px, 9vw, 120px)',
    pb: 28,
  },
  fadeIn: {
    fill: true,
    animationKeyframes: 'fade-in',
    animationDuration: '900ms',
    animationTimingFunction: 'var(--ease-out)',
  },
  scrim: {
    backgroundImage: [
      'linear-gradient(90deg, var(--kroma-bg) 2%,',
      'color-mix(in srgb, var(--kroma-bg) 62%, transparent) 30%,',
      'color-mix(in srgb, var(--kroma-bg) 18%, transparent) 54%, transparent 72%),',
      'linear-gradient(0deg, var(--kroma-bg) 0%,',
      'color-mix(in srgb, var(--kroma-bg) 55%, transparent) 20%, transparent 52%)',
    ].join(' '),
  },
  glow: {
    fill: true,
    pointerEvents: 'none',
    animationKeyframes: 'kroma-breathe',
    animationDuration: '7s',
    animationTimingFunction: 'var(--ease-out)',
    animationIterationCount: 'infinite',
    backgroundImage:
      'radial-gradient(58% 68% at 74% 30%, color-mix(in srgb, var(--kroma-accent-wash) 14%, transparent), transparent 62%)',
  },
});

/** The few titles the home opens on, one at a time: it pages by itself, by
 * the arrow keys, and by the strip of the titles still to come. */
export function HeroCarousel({ section }: Readonly<{ section: HomeSection }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const { client } = useAuth();
  const still = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const entries = section.items;
  const carousel = useCarousel(entries.length, hovered || focused || still);
  const entry = entries[carousel.index];
  const backdrop = entry ? entryBackdrop(client, entry, BACKDROP_W) : null;
  const previous = useCrossfade(backdrop);

  if (!entry || !backdrop) return null;
  const [from, to] = posterColors(entryId(entry));
  const wash = `linear-gradient(158deg, ${from}, ${to})`;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') carousel.step(1);
    else if (event.key === 'ArrowLeft') carousel.step(-1);
  };

  return (
    <section
      className={classes(s.hero)}
      aria-roledescription="carousel"
      aria-label={section.title}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={onKeyDown}
    >
      {previous ? <Image src={previous} fit="cover" position="center 20%" fill /> : null}
      <Box key={backdrop} style={s.fadeIn}>
        <Image src={backdrop} fit="cover" position="center 20%" background={wash} fill priority />
      </Box>
      <Box style={s.glow} />
      <Box fill pointerEvents="none" style={s.scrim} />

      <HeroSlide
        key={entryId(entry)}
        entry={entry}
        note={section.notes[entryId(entry)] ?? section.title}
        position={t('content.heroPosition', {
          current: carousel.index + 1,
          total: entries.length,
        })}
      />
      {entries.length > 1 ? <HeroPager entries={entries} carousel={carousel} /> : null}
    </section>
  );
}
