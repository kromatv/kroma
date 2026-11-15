import { Image } from 'react-native';
import type { PixelSize } from './crop-geometry';

/** A picture's own size in pixels, or null when it cannot be loaded. */
export function imageSize(src: string): Promise<PixelSize | null> {
  return new Promise((resolve) => {
    Image.getSize(
      src,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    );
  });
}
