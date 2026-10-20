interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A frosted rectangle in canvas pixels, origin bottom-left as WebGL draws. */
export interface GlRect {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
}

/**
 * Where a surface lands on the canvas: `surface` and `frame` are client rects,
 * `pixels` the canvas's backing size, `radius` the surface's corner in its own
 * unscaled CSS px and `layoutWidth` its unscaled width, so a focus scale scales
 * the corner too. Null when nothing of it is on the canvas.
 */
export function glRect(
  surface: Box,
  frame: Box,
  pixels: { width: number; height: number },
  radius: number,
  layoutWidth: number,
): GlRect | null {
  if (surface.width <= 0 || surface.height <= 0 || frame.width <= 0 || frame.height <= 0) {
    return null;
  }
  const kx = pixels.width / frame.width;
  const ky = pixels.height / frame.height;
  const x = (surface.left - frame.left) * kx;
  const top = (surface.top - frame.top) * ky;
  const w = surface.width * kx;
  const h = surface.height * ky;
  if (x >= pixels.width || top >= pixels.height || x + w <= 0 || top + h <= 0) return null;
  const scale = layoutWidth > 0 ? surface.width / layoutWidth : 1;
  return {
    x,
    y: pixels.height - top - h,
    w,
    h,
    radius: Math.min(radius * scale * kx, w / 2, h / 2),
  };
}

/** The object-fit: cover placement of an image of `art` size in `frame`, at a
 *  CSS object-position given as fractions, as a scale and offset in frame units
 *  (texture coordinate = position * scale + offset). */
export function coverMap(
  frame: { width: number; height: number },
  art: { width: number; height: number },
  at: { x: number; y: number },
): { sx: number; sy: number; ox: number; oy: number } {
  const k = Math.max(frame.width / art.width, frame.height / art.height);
  const w = art.width * k;
  const h = art.height * k;
  const left = (frame.width - w) * at.x;
  const top = (frame.height - h) * at.y;
  return {
    sx: frame.width / w,
    sy: frame.height / h,
    ox: -left / w,
    oy: -top / h,
  };
}
