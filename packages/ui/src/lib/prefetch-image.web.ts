import { webDocument } from './dom';

/** Warm the image cache with `url` and decode it; resolves true once it can paint at once. */
export function prefetchImage(url: string): Promise<boolean> {
  const img = webDocument()?.createElement('img');
  if (!img) return Promise.resolve(false);
  img.fetchPriority = 'low';
  img.decoding = 'async';
  img.src = url;
  const decoded = img.decode
    ? img.decode()
    : new Promise((done, fail) => {
        img.onload = done;
        img.onerror = fail;
      });
  return decoded.then(
    () => true,
    () => false,
  );
}
