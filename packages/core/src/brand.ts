// The chromatic wheel's geometry: the "O" of the KROMA lockup, drawn as six
// annular sectors instead of a masked ring so every surface can render it from
// plain path data (SVG in the browser, react-native-svg on mobile, a rasterizer
// in the brand-asset generator) with no mask support required.
//
// This lives in core because the same six paths are consumed by both runtime UI
// and the build-time asset generator; keeping one copy is what makes the app
// icon and the in-app logo provably the same shape.

/** Two decimals: keeps the emitted path data short and byte-stable, so
 * regenerating an asset doesn't produce a spurious diff. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The lockup's hub/outer radius ratio. The wheel reads as a letter O only at
 * this proportion, so every caller derives its inner radius from it. */
export const WHEEL_HUB_RATIO = 17.045 / 50;

/** SVG path data for the wheel's six sectors around `(cx, cy)`, outer radius
 * `R`, hub radius `r`. Defaults frame the lockup's own O (Frame 2). */
export function wheelSectors(cx = 209, cy = 50, R = 50, r = 50 * WHEEL_HUB_RATIO): string[] {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const pt = (radius: number, deg: number) => [
    round2(cx + radius * Math.sin(rad(deg))),
    round2(cy - radius * Math.cos(rad(deg))),
  ];
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const [a1, a2] = [i * 60, i * 60 + 60];
    const [ox1, oy1] = pt(R, a1);
    const [ox2, oy2] = pt(R, a2);
    const [ix1, iy1] = pt(r, a1);
    const [ix2, iy2] = pt(r, a2);
    out.push(
      `M${ix1} ${iy1} L${ox1} ${oy1} A${R} ${R} 0 0 1 ${ox2} ${oy2} L${ix2} ${iy2} A${r} ${r} 0 0 0 ${ix1} ${iy1} Z`,
    );
  }
  return out;
}
