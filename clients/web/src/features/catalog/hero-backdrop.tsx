import { sizedImageUrl } from '@kroma/core';
import { Box, styles } from '@kroma/ui/kit';
import { Image } from '#web/shared/ui';

// Reading frost light + wide so the backdrop still reads through. The mask
// stops are a min() of a percentage and a rem: on a phone the rem stops alone
// would cover the whole viewport.
const FROST_MASK =
  'linear-gradient(90deg, #000 0%, #000 min(35%, 22rem), transparent min(100%, 68rem))';

const s = styles({
  vignette: {
    backgroundImage: 'radial-gradient(125% 125% at 80% 22%, transparent 38%, var(--kroma-bg) 94%)',
  },
  sideFade: {
    backgroundImage: [
      'linear-gradient(90deg, var(--kroma-bg) 0%,',
      'color-mix(in srgb, var(--kroma-bg) 74%, transparent) 22%,',
      'color-mix(in srgb, var(--kroma-bg) 34%, transparent) 46%,',
      'color-mix(in srgb, var(--kroma-bg) 8%, transparent) 64%,',
      'transparent 80%)',
    ].join(' '),
  },
  bottomFade: {
    backgroundImage: 'linear-gradient(0deg, var(--kroma-bg) 3%, transparent 46%)',
  },
  frost: {
    fill: true,
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    backgroundImage: [
      'linear-gradient(to top,',
      'color-mix(in srgb, var(--kroma-bg) 58%, transparent) 0%,',
      'color-mix(in srgb, var(--kroma-bg) 34%, transparent) 100%)',
    ].join(' '),
    maskImage: FROST_MASK,
    WebkitMaskImage: FROST_MASK,
  },
});

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
      <Box fill style={s.vignette} />
      <Box fill style={s.sideFade} />
      <Box fill style={s.bottomFade} />
      <Box style={s.frost} />
    </>
  );
}
