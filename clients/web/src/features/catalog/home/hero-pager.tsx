import { posterColors } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, Focusable, IconButton, styles, useBreakpoint, useStyles } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';
import {
  entryBackdrop,
  entryId,
  entryTitle,
  type HomeEntry,
} from '#web/features/catalog/home/entries';
import { type Carousel, HOLD_MS } from '#web/features/catalog/home/use-carousel';
import { useAuth } from '#web/shared/lib/auth';
import { Image } from '#web/shared/ui';

const THUMB_W = 132;

const sDefinition = styles({
  bar: { position: 'relative', mt: 28 },
  thumb: {
    w: THUMB_W,
    aspect: 16 / 9,
    radius: 'md',
    overflow: 'hidden',
    opacity: 0.55,
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: 'transparent',
    transitionProperty: 'opacity, outline-color',
    transitionDuration: 'var(--dur-base)',
  },
  thumbUp: { opacity: 1, outlineColor: 'accent' },
  dot: { w: 28, h: 4, radius: 'pill', overflow: 'hidden', bg: 'white/25' },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, h: 3, bg: 'black/40' },
  fill: { fill: true, bg: 'accent', transformOrigin: 'left' },
  filling: {
    animationKeyframes: 'kroma-fill',
    animationDuration: `${HOLD_MS}ms`,
    animationTimingFunction: 'linear',
    animationFillMode: 'both',
  },
});

export interface HeroPagerProps {
  entries: readonly HomeEntry[];
  carousel: Carousel;
}

interface PagerStopProps {
  entry: HomeEntry;
  index: number;
  carousel: Carousel;
  roomy: boolean;
}

function PagerHold({ carousel, up }: Readonly<{ carousel: Carousel; up: boolean }>) {
  const s = useStyles(sDefinition);

  return (
    <Box
      key={`${carousel.index}:${carousel.running}`}
      style={[s.fill, up && carousel.running ? s.filling : null]}
      opacity={up ? 1 : 0}
    />
  );
}

function PagerThumb({ entry, children }: Readonly<{ entry: HomeEntry; children: ReactNode }>) {
  const s = useStyles(sDefinition);
  const { client } = useAuth();

  return (
    <>
      <Image
        src={entryBackdrop(client, entry, THUMB_W * 2)}
        background={`linear-gradient(158deg, ${posterColors(entryId(entry)).join(', ')})`}
        fit="cover"
        fill
      />
      <Box style={s.track}>{children}</Box>
    </>
  );
}

function PagerStop({ entry, index, carousel, roomy }: Readonly<PagerStopProps>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const up = index === carousel.index;
  const hold = <PagerHold carousel={carousel} up={up} />;

  return (
    <Focusable
      label={t('content.heroShow', { title: entryTitle(entry) })}
      pressed={up}
      onPress={() => carousel.go(index)}
      style={roomy ? [s.thumb, up ? s.thumbUp : null] : s.dot}
    >
      {roomy ? <PagerThumb entry={entry}>{hold}</PagerThumb> : hold}
    </Focusable>
  );
}

function PagerControls({ carousel }: Readonly<{ carousel: Carousel }>) {
  const t = useT();

  return (
    <>
      <IconButton
        variant="glass"
        diameter={36}
        icon={carousel.stopped ? 'player-play' : 'player-pause'}
        label={t(carousel.stopped ? 'content.heroResume' : 'content.heroPause')}
        onPress={carousel.toggle}
      />
      <IconButton
        variant="glass"
        diameter={36}
        icon="chevron-left"
        label={t('content.heroPrevious')}
        onPress={() => carousel.step(-1)}
      />
      <IconButton
        variant="glass"
        diameter={36}
        icon="chevron-right"
        label={t('content.heroNext')}
        onPress={() => carousel.step(1)}
      />
    </>
  );
}

/** The titles of the hero as a strip to page through: thumbnails where there
 * is room, bars where there is not, the one that is up filling as its hold
 * runs out. */
export function HeroPager({ entries, carousel }: Readonly<HeroPagerProps>) {
  const s = useStyles(sDefinition);
  const step = useBreakpoint();
  const roomy = step === 'lg' || step === 'tv';

  return (
    <Box row align="center" gap={10} style={s.bar}>
      {entries.map((entry, index) => (
        <PagerStop
          key={entryId(entry)}
          entry={entry}
          index={index}
          carousel={carousel}
          roomy={roomy}
        />
      ))}
      <Box grow={1} />
      <PagerControls carousel={carousel} />
    </Box>
  );
}
