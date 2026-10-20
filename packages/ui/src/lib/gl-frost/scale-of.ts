/** The uniform scale a computed `transform` applies, 1 for none. */
export function scaleOf(transform: string): number {
  const m = /^matrix\(([^,]+),/.exec(transform);
  const a = m ? Number(m[1]) : 1;
  return Number.isFinite(a) && a > 0 ? a : 1;
}
