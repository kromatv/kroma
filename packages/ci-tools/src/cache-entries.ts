export interface Entry {
  id: number;
  key: string;
  createdAt: string;
}

/** Every entry past the newest `keep`, oldest last. */
export function stale(entries: readonly Entry[], keep: number): Entry[] {
  const byAge = [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return byAge.slice(keep);
}
