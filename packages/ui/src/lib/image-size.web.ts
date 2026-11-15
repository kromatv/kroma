import type { PixelSize } from './crop-geometry';
import { webDocument } from './dom';

/** A picture's own size in pixels, or null when it cannot be loaded. */
export function imageSize(src: string): Promise<PixelSize | null> {
  const image = webDocument()?.createElement('img');
  if (!image) return Promise.resolve(null);
  return new Promise((resolve) => {
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
