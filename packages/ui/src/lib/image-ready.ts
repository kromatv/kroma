const LIMIT = 800;

const ready = new Set<string>();

/** Record that `uri` is decoded or cached, so the next surface to draw it skips the fade. */
export function markImageReady(uri: string): void {
  ready.delete(uri);
  ready.add(uri);
  if (ready.size <= LIMIT) return;
  const oldest = ready.values().next().value;
  if (oldest !== undefined) ready.delete(oldest);
}

/** Whether `uri` has been loaded or prefetched recently enough to draw at once. */
export function isImageReady(uri: string): boolean {
  return ready.has(uri);
}

/** Forget every ready image. For tests. */
export function resetImageReady(): void {
  ready.clear();
}
