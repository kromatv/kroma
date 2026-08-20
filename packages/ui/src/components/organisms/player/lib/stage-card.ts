// Where the picture sits on the stage, and where it goes once the settings panel
// takes half of it.
//
// Every number here is a FRACTION of the stage, never a pixel, and that is
// load-bearing: a television shell lays its chrome out at 1920x1080 and then
// CSS-scales the whole canvas onto the screen, so `onLayout` hands back the
// SCALED size while a style written back is read at layout size. Fractions
// cancel that scale out. It is also why the shrink is a scale about a computed
// origin rather than a translate: a transform origin takes a percentage on both
// platforms, a translate does not.

import type { PlaneRect } from '../types';
import { CARD_MARGIN, MIN_CARD_SCALE, panelGeometry } from './metrics';

/** A rectangle on the stage, as fractions of the stage's own width and height. */
export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageCard {
  /** The picture's box on the un-shrunken stage, or null while the stage is
   *  unmeasured or the media has not declared its shape - the surface fills the
   *  stage then, which is what the shrink assumed before aspects were known. */
  picture: StageRect | null;
  scale: number;
  /** The horizontal transform origin, as a fraction of the stage width, that
   *  makes `scale` land the picture on the card. The vertical origin is always
   *  the middle: the picture is centred there, and the card is too. */
  origin: number;
  /** The same card as viewport fractions, for a native plane that cannot be
   *  transformed and is moved with `setPlaneRect` instead. */
  rect: PlaneRect;
}

const FULL: StageRect = { x: 0, y: 0, width: 1, height: 1 };

function pictureRect(width: number, height: number, aspect: number | undefined): StageRect | null {
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0 || width <= 0 || height <= 0) {
    return null;
  }
  const letterboxed = width / aspect <= height;
  const w = letterboxed ? 1 : (height * aspect) / width;
  const h = letterboxed ? width / aspect / height : 1;
  return { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h };
}

/** The picture on a `width` x `height` stage, and the card it shrinks into
 * beside the settings panel. `aspect` is the picture's display ratio (w/h); with
 * none the picture is the whole stage, which is what the shrink used to assume.
 * The two sizes are only ever read as a ratio, so their unit does not matter. */
export function stageCard(width: number, height: number, aspect?: number): StageCard {
  const picture = pictureRect(width, height, aspect);
  const box = picture ?? FULL;
  const free = width > 0 ? Math.max(0, width - panelGeometry(width).width) / width : 0;
  const margin = {
    x: width > 0 ? CARD_MARGIN / width : 0,
    y: height > 0 ? CARD_MARGIN / height : 0,
  };
  // Never past the fraction panelGeometry already calls too small to shrink to:
  // a stage barely deeper than its own margins would otherwise scale to nothing.
  const fit = (slot: number, side: number) => Math.max(slot / side, MIN_CARD_SCALE);
  const scale =
    free > 0
      ? Math.min(
          fit(Math.max(0, free - margin.x * 2), box.width),
          fit(Math.max(0, 1 - margin.y * 2), box.height),
          1,
        )
      : 0.5;
  const card = { width: box.width * scale, height: box.height * scale };
  // Scaling about O maps a point P to O + (P - O) * scale. Solved for the O that
  // lands the picture's middle on the card's; at scale 1 there is nothing to map.
  const middle = { picture: box.x + box.width / 2, card: free / 2 };
  const origin =
    1 - scale > 1e-6 ? (middle.card - scale * middle.picture) / (1 - scale) : middle.picture;
  return {
    picture,
    scale,
    origin,
    rect: {
      x: origin + (box.x - origin) * scale,
      y: (1 - card.height) / 2,
      w: card.width,
      h: card.height,
    },
  };
}
