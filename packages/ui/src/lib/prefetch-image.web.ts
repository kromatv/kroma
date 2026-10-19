import { webDocument } from './dom';

/** Warm the image cache with `url`; failures are ignored. */
export function prefetchImage(url: string): void {
  const img = webDocument()?.createElement('img');
  if (!img) return;
  img.src = url;
  img.decode?.().catch(() => undefined);
}
