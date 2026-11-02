import type { ModuleEntry } from '#site/catalog';

export interface Download {
  url: string;
  size: number | null;
  sha256: string | null;
}

/** The one `.kmod` a visitor can fetch for a module, falling back to the
 *  top-level artifact an older catalog carries, or `null` when there is none. */
export function download(m: ModuleEntry): Download | null {
  const listed = m.artifacts.find((a) => a.url);
  if (listed?.url) {
    return { url: listed.url, size: listed.size ?? null, sha256: listed.sha256 ?? null };
  }
  return m.url ? { url: m.url, size: m.size ?? null, sha256: m.sha256 ?? null } : null;
}
