import { webDocument } from '#ui/lib/dom';

interface Stop {
  color: string;
  at: number | null;
}

interface Ramp {
  angle: number;
  stops: Stop[];
}

const SIDES: Record<string, number> = {
  'to top': 0,
  'to right': 90,
  'to bottom': 180,
  'to left': 270,
};

function splitTop(css: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ',' && depth === 0) {
      parts.push(css.slice(from, i).trim());
      from = i + 1;
    }
  }
  parts.push(css.slice(from).trim());
  return parts.filter(Boolean);
}

function stopOf(part: string): Stop {
  const at = /\s(-?[\d.]+)%$/.exec(part);
  return at
    ? { color: part.slice(0, at.index).trim(), at: Number(at[1]) / 100 }
    : { color: part, at: null };
}

/** The `linear-gradient(...)` list a veil is written as, or null for anything
 *  else (a radial gradient, a length stop), which the caller paints as CSS. */
export function parseRamps(css: string): Ramp[] | null {
  const ramps: Ramp[] = [];
  for (const layer of splitTop(css)) {
    const body = /^linear-gradient\((.*)\)$/.exec(layer)?.[1];
    if (!body) return null;
    const args = splitTop(body);
    const head = args[0] ?? '';
    const degrees = /^(-?[\d.]+)deg$/.exec(head);
    const side = SIDES[head];
    const angle = degrees ? Number(degrees[1]) : (side ?? 180);
    const stops = (degrees || side !== undefined ? args.slice(1) : args).map(stopOf);
    if (stops.length < 2 || stops.some((s) => /\d(px|em|rem)$/.test(s.color))) return null;
    ramps.push({ angle, stops });
  }
  return ramps.length > 0 ? ramps : null;
}

const WIDTH = 96;
const HEIGHT = 54;
const drawn = new Map<string, string | null>();

function draw(doc: Document, ramps: Ramp[]): string | null {
  const canvas = doc.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const g = canvas.getContext('2d');
  if (!g) return null;
  for (const { angle, stops } of [...ramps].reverse()) {
    const rad = (angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const half = (Math.abs(WIDTH * dx) + Math.abs(HEIGHT * dy)) / 2;
    const fill = g.createLinearGradient(
      WIDTH / 2 - dx * half,
      HEIGHT / 2 - dy * half,
      WIDTH / 2 + dx * half,
      HEIGHT / 2 + dy * half,
    );
    for (const [i, stop] of stops.entries()) {
      fill.addColorStop(stop.at ?? i / (stops.length - 1), stop.color);
    }
    g.fillStyle = fill;
    g.fillRect(0, 0, WIDTH, HEIGHT);
  }
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
