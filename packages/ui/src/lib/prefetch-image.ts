import { Image } from 'react-native';

/** Warm the image cache with `url`; resolves true once it is cached, false on failure. */
export function prefetchImage(url: string): Promise<boolean> {
  return Image.prefetch(url).catch(() => false);
}
