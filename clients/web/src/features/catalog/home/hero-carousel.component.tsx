import { posterColors } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, classes, styles, useStyles } from '@kromatv/ui/kit';
import { useEffect, useEffectEvent, useState } from 'react';
import {
  entryBackdrop,
  entryId,
  type HomeEntry,
  type HomeSection,
} from '#web/features/catalog/home/entries';
import { HeroPager } from '#web/features/catalog/home/hero-pager.component';
import { HeroSlide } from '#web/features/catalog/home/hero-slide.component';
import { type Carousel, useCarousel } from '#web/features/catalog/home/use-carousel.hook';
import { useAuth } from '#web/shared/lib/auth';
import { useCrossfade } from '#web/shared/lib/use-crossfade.hook';
import { useReducedMotion } from '#web/shared/lib/use-reduced-motion.hook';
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

interface HeroBackdropProps {
  id: string;
  src: string;
  previous: string | null;
}

function HeroBackdrop({ id, src, previous }: Readonly<HeroBackdropProps>) {
  const s = useStyles(sDefinition);
  const [from, to] = posterColors(id);
  const wash = `linear-gradient(158deg, ${from}, ${to})`;

  return (
    <>
      {previous ? <Image src={previous} fit="cover" position="center 20%" fill /> : null}
      <Box key={src} style={s.fadeIn}>
        <Image src={src} fit="cover" position="center 20%" background={wash} fill priority />
      </Box>
      <Box style={s.glow} />
      <Box fill pointerEvents="none" style={s.scrim} />
    </>
  );
}

function useHeroBackdrop(entry: HomeEntry | undefined) {
  const { client } = useAuth();
  const backdrop = entry ? entryBackdrop(client, entry, BACKDROP_W) : null;
  return { backdrop, previous: useCrossfade(backdrop) };
}

function useListener<K extends keyof HTMLElementEventMap>(
  node: HTMLElement | null,
  type: K,
  handle: (event: HTMLElementEventMap[K]) => void,
) {
  const handleLatest = useEffectEvent(handle);
  useEffect(() => {
    if (!node) {
      return undefined;
    }
    const listener = (event: HTMLElementEventMap[K]) => handleLatest(event);
    node.addEventListener(type, listener);
    return () => node.removeEventListener(type, listener);
  }, [node, type]);
}

function useArrowKeys(node: HTMLElement | null, carousel: Carousel) {
  useListener(node, 'keydown', (event) => {
    if (event.key === 'ArrowRight') {
      carousel.step(1);
    } else if (event.key === 'ArrowLeft') {
      carousel.step(-1);
    }
  });
}

function useResting(node: HTMLElement | null) {
  const still = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useListener(node, 'pointerenter', () => setHovered(true));
  useListener(node, 'pointerleave', () => setHovered(false));
  useListener(node, 'focusin', () => setFocused(true));
  useListener(node, 'focusout', () => setFocused(false));
  return hovered || focused || still;
}

function useHeroCarousel(count: number) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const carousel = useCarousel(count, { resting: useResting(node) });
  useArrowKeys(node, carousel);
  return { setNode, carousel };
}

interface CurrentSlideProps {
  section: HomeSection;
  entry: HomeEntry;
  carousel: Carousel;
}

function CurrentSlide({ section, entry, carousel }: Readonly<CurrentSlideProps>) {
  const t = useT();
  return (
    <HeroSlide
      entry={entry}
      note={section.notes[entryId(entry)] ?? section.title}
      position={t('content.heroPosition', {
        current: carousel.index + 1,
        total: section.items.length,
      })}
    />
  );
}

/** The few titles the home opens on, one at a time: it pages by itself, by
 * the arrow keys, and by the strip of the titles still to come. */
export function HeroCarousel({ section }: Readonly<{ section: HomeSection }>) {
  const s = useStyles(sDefinition);
  const entries = section.items;
  const { setNode, carousel } = useHeroCarousel(entries.length);
  const entry = entries[carousel.index];
  const { backdrop, previous } = useHeroBackdrop(entry);

  if (!entry || !backdrop) {
    return null;
  }

  return (
    <section
      ref={setNode}
      className={classes(s.hero)}
      aria-roledescription="carousel"
      aria-label={section.title}
    >
      <HeroBackdrop id={entryId(entry)} src={backdrop} previous={previous} />
      <CurrentSlide key={entryId(entry)} section={section} entry={entry} carousel={carousel} />
      {entries.length > 1 ? <HeroPager entries={entries} carousel={carousel} /> : null}
    </section>
  );
}
