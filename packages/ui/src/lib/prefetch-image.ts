import { Image } from 'react-native';

/** Warm the image cache with `url`; failures are ignored. */
export function prefetchImage(url: string): void {
  Image.prefetch(url).catch(() => undefined);
}
