// <ArtScrim>: the gradient laid over artwork so what sits on it stays legible.
//
// Named for how far the dark reaches rather than for the tile that wanted it,
// because the ramps are the design's and the tiles only pick one.

import { Box } from '#ui/components/atoms/box';
import { type CornerValue, color, styles } from '#ui/core';
import { gradient } from '#ui/lib/css';

type ArtScrimVariant = 'soft' | 'deep';

/** The landscape rail tile's fade: dark only where the caption sits. */
const CARD_SCRIM = `linear-gradient(to bottom, ${color('black/5')} 40%, ${color('black/75')} 100%)`;

/** Steeper than the rail tile's: a poster is taller, so the fade has further to
 *  travel before it reaches the title, and it has to be dark BEFORE the text
 *  starts rather than at the last pixel. A two-line title occupies roughly the
 *  bottom fifth of the card. */
const POSTER_SCRIM = [
  'linear-gradient(to top,',
  `${color('black/92')} 0%,`,
  `${color('black/78')} 20%,`,
  `${color('black/32')} 42%,`,
  `${color('black/8')} 62%,`,
  `${color('black/0')} 78%)`,
].join(' ');

const RAMP = { soft: gradient(CARD_SCRIM), deep: gradient(POSTER_SCRIM) } as const;

interface ArtScrimProps {
  /** How far up the dark reaches. `soft` leaves the artwork alone until the
   *  bottom third; `deep` is already dark under a caption that sits ON the art. */
  variant?: ArtScrimVariant;
  /** The corner of the tile this fills. The layer rounds itself as well as being
   *  clipped by its parent: Chrome fails to apply an `overflow: hidden` +
   *  `border-radius` clip to a composited descendant, which an <Img> is. */
  radius?: CornerValue;
}

function ArtScrim({ variant = 'soft', radius = 0 }: Readonly<ArtScrimProps>) {
  return <Box radius={radius} style={[s.layer, RAMP[variant]]} />;
}

const s = styles({ layer: { fill: true, pointerEvents: 'none' } });

export type { ArtScrimProps, ArtScrimVariant };
export { ArtScrim, CARD_SCRIM, POSTER_SCRIM };
