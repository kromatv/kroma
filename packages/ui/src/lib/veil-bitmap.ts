import { webDocument } from '#ui/lib/dom';
import { parseRamps, paintRamps, type Ramp } from '#ui/lib/ramp-paint';

const WIDTH = 96;
const HEIGHT = 54;
const drawn = new Map<string, string | null>();

function draw(doc: Document, ramps: Ramp[]): string | null {
  const canvas = doc.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const g = canvas.getContext('2d');
  if (!g) return null;
  paintRamps(g, ramps, WIDTH, HEIGHT);
  return canvas.toDataURL('image/png');
}

/** The ramp drawn once into a small PNG, as a data URL, or null where there is
 *  no canvas to draw it with or the ramp is not one this can draw. */
export function veilBitmap(css: string): string | null {
  const known = drawn.get(css);
  if (known !== undefined) return known;
  const doc = webDocument();
  const ramps = doc ? parseRamps(css) : null;
  let url: string | null = null;
  try {
    url = doc && ramps ? draw(doc, ramps) : null;
  } catch {
    url = null;
  }
  drawn.set(css, url);
  return url;
}
