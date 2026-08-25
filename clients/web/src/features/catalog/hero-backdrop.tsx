import { sizedImageUrl } from '@kroma/core';
import { Box, gradient } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';
import { Image } from '#web/shared/ui';

const VIGNETTE = gradient(
  'radial-gradient(125% 125% at 80% 22%, transparent 38%, var(--kroma-bg) 94%)',
);

const SIDE_FADE = gradient(
  [
    'linear-gradient(90deg, var(--kroma-bg) 0%,',
    'color-mix(in srgb, var(--kroma-bg) 74%, transparent) 22%,',
    'color-mix(in srgb, var(--kroma-bg) 34%, transparent) 46%,',
    'color-mix(in srgb, var(--kroma-bg) 8%, transparent) 64%,',
    'transparent 80%)',
  ].join(' '),
);

const BOTTOM_FADE = gradient('linear-gradient(0deg, var(--kroma-bg) 3%, transparent 46%)');

// Reading frost light + wide so the backdrop still reads through. The mask
// stops are a min() of a percentage and a rem: on a phone the rem stops alone
// would cover the whole viewport. A mask has no name in the kit's vocabulary,
// so this layer stays a plain element.
const FROST_MASK =
  'linear-gradient(90deg, #000 0%, #000 min(35%, 22rem), transparent min(100%, 68rem))';

const FROST: CSSProperties = {
  position: 'absolute',
  inset: 0,
  backdropFilter: 'blur(2px)',
  WebkitBackdropFilter: 'blur(2px)',
  backgroundImage: [
    'linear-gradient(to top,',
    'color-mix(in srgb, var(--kroma-bg) 58%, transparent) 0%,',
    'color-mix(in srgb, var(--kroma-bg) 34%, transparent) 100%)',
  ].join(' '),
  maskImage: FROST_MASK,
  WebkitMaskImage: FROST_MASK,
};

/** Layered backdrop + scrims for the cinematic `DetailHero`. Overlays text on an
 * *unknown* key-art image, so legibility can't assume dark art: each layer fades
 * over a long, soft distance instead of a hard edge, keeping the art visible. */
export function HeroBackdrop({
  backdrop,
  gradient: art,
}: Readonly<{ backdrop: string | null; gradient: string }>) {
  const sized = sizedImageUrl(backdrop, typeof window !== 'undefined' ? window.innerWidth : 960);
  return (
    <>
      <Image src={sized} fit="cover" background={art} fill priority />
      <Box fill style={VIGNETTE} />
      <Box fill style={SIDE_FADE} />
      <Box fill style={BOTTOM_FADE} />
      <div style={FROST} />
    </>
  );
}
