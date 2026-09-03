// devicePixelRatio, rounded and capped at 2: a 3x phone gains nothing visible
// and a fractional ratio would defeat the server's bucketing.
function artworkRatio(): number {
  const dpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  return Math.min(2, Math.max(1, Math.round(dpr ?? 1)));
}

// The server's rendition ladder (`IMAGE_WIDTHS` in api/images.rs). The ask is
// snapped to it HERE rather than only server-side, because the URL is the cache
// key: a fluid grid whose cell is 203px on one window and 219px on the next
// would otherwise mint two keys - and two decodes - for the one rendition the
// server hands back for both.
const ARTWORK_WIDTHS = [160, 240, 320, 480, 780, 960];
const WIDEST_ARTWORK = Math.max(...ARTWORK_WIDTHS);

let artworkScale = 1;

/** The `?w=` a surface drawn `displayWidth` wide must ask for: device pixels,
 * capped at the widest rendition the server keeps, scaled by the device's
 * artwork-quality setting, then snapped up to a rendition that exists. The one
 * place a drawn size becomes a request, so `resolveArt` and `sizedImageUrl`
 * cannot drift apart. */
export function artworkWidth(displayWidth: number): number {
  const devicePixels = Math.min(displayWidth * artworkRatio(), WIDEST_ARTWORK);
  const asked = Math.max(1, Math.round(devicePixels * artworkScale));
  return ARTWORK_WIDTHS.find((bucket) => bucket >= asked) ?? WIDEST_ARTWORK;
}

/** Scale every artwork request, for the device's artwork-resolution setting.
 *
 * 1 asks for the full width {@link artworkWidth} would otherwise request. Lower
 * trades sharpness for decode time and texture memory, which is the trade a
 * television with a weak SoC wants and a desktop does not. Clamped to a range
 * where the result is still artwork: past 1 nothing is gained on a panel that
 * draws at 1x, and below a quarter a poster is mush. Process-wide: `sizedImageUrl`
 * in `@kroma/core` reads it from a free function holding no client, so one
 * process must serve one device. */
export function setArtworkScale(scale: number): void {
  artworkScale = Math.min(1, Math.max(0.25, scale));
}

/** The current artwork multiplier (the HUD and tests read it). */
export function artworkScaleValue(): number {
  return artworkScale;
}
