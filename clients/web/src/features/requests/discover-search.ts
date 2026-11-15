import type { DiscoverType } from '@kromatv/client/discovery';

export type DiscoverSearch = { q: string; type: DiscoverType };

export function validateDiscoverSearch(s: Record<string, unknown>): DiscoverSearch {
  const q = typeof s.q === 'string' ? s.q : '';
  const rawType = typeof s.type === 'string' ? s.type : 'all';
  const type: DiscoverType = rawType === 'movie' || rawType === 'tv' ? rawType : 'all';
  return { q, type };
}
