import type { ModuleEntry } from '#site/catalog';

export interface Download {
  target: string | null;
  url: string;
  size: number | null;
  sha256: string | null;
}

const ORDER = [
  'x86_64-unknown-linux-musl',
  'aarch64-unknown-linux-musl',
  'aarch64-apple-darwin',
  'x86_64-apple-darwin',
];

const rank = (target: string | null) => {
  const at = target ? ORDER.indexOf(target) : -1;
  return at === -1 ? ORDER.length : at;
};

/** Every `.kmod` a visitor can actually fetch, the likeliest platform first,
 *  falling back to the top-level artifact a single-target module carries. */
export function downloads(m: ModuleEntry): Download[] {
  const listed = (m.artifacts ?? []).flatMap((a) =>
    a.url
      ? [{ target: a.target ?? null, url: a.url, size: a.size ?? null, sha256: a.sha256 ?? null }]
      : [],
  );
  if (listed.length > 0) return listed.sort((a, b) => rank(a.target) - rank(b.target));
  return m.url
    ? [{ target: null, url: m.url, size: m.size ?? null, sha256: m.sha256 ?? null }]
    : [];
}
