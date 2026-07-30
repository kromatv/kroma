// CSS `object-position` maths for React Native, whose <Image> only offers a
// hard-centred `resizeMode="cover"`.

/** A CSS position string (`'50% 28%'`, `'50%'`, `'center top'`) as fractions. */
export function parsePosition(value: string): { x: number; y: number } {
  const parts = value.trim().split(/\s+/);
  const x = axis(parts[0], 0.5);
  // Per CSS, a single value sets the horizontal axis and centres the vertical one.
  const y = axis(parts[1], 0.5);
  return { x, y };
}

const KEYWORDS: Record<string, number> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };

function axis(token: string | undefined, fallback: number): number {
  if (token === undefined) return fallback;
  const keyword = KEYWORDS[token];
  if (keyword !== undefined) return keyword;
  const pct = /^(-?[\d.]+)%$/.exec(token);
  if (!pct?.[1]) return fallback;
  const n = Number.parseFloat(pct[1]);
  return Number.isFinite(n) ? n / 100 : fallback;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The rectangle to draw `source` at so it covers `box` with its focal point at
 * `position`, mirroring `object-fit: cover` + `object-position`. Null when either
 * size is not known yet, which callers treat as a plain centred cover.
 */
export function coverRect(
  box: { width: number; height: number } | null,
  source: { width: number; height: number } | null,
  position: { x: number; y: number },
): Rect | null {
  if (!box || !source || box.width <= 0 || box.height <= 0) return null;
  if (source.width <= 0 || source.height <= 0) return null;

  const scale = Math.max(box.width / source.width, box.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    left: noNegZero(-(width - box.width) * position.x),
    top: noNegZero(-(height - box.height) * position.y),
    width,
    height,
  };
}

// Negating an exact zero offset yields -0, which lays out fine but reads
// confusingly in snapshots and equality checks.
const noNegZero = (n: number) => (n === 0 ? 0 : n);
