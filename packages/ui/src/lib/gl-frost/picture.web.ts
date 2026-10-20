import { parsePosition } from '#ui/lib/cover-rect';
import { veilBitmap } from '#ui/lib/veil-bitmap';
import type { FrostPicture } from './engine.web';

function load(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((done) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = src;
  });
}

/** The art and veil a frost layer draws, loaded, or null when the art will not load. */
export async function loadPicture(
  src: string,
  veil: string | undefined,
  position: string,
  amount: number,
): Promise<FrostPicture | null> {
  const art = await load(src, true);
  if (!art) return null;
  const ramp = veil ? veilBitmap(veil) : null;
  return {
    art,
    veil: ramp ? await load(ramp, false) : null,
    at: parsePosition(position),
    amount,
  };
}
