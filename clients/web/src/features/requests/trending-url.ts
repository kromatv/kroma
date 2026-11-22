import { redirect } from '@tanstack/react-router';
import { z } from 'zod';

const TrendingSearchParams = z
  .object({ page: z.number().int().min(2).optional().catch(undefined) })
  .catch({});

export interface TrendingSearch {
  page?: number;
}

/** Validate the trending page's search params. The first page is the absence
 * of one, so `?page=1` and a page that is not a whole number both drop out. */
export function validateTrendingSearch(s: Record<string, unknown>): TrendingSearch {
  const { page } = TrendingSearchParams.parse(s);
  return page === undefined ? {} : { page };
}

/** Send a trending url naming neither films nor shows to the search. */
export function requireTrendingKind({ params }: { params: { type: string } }): void {
  if (params.type !== 'movie' && params.type !== 'tv') {
    throw redirect({ to: '/search', search: { q: '', type: 'all' } });
  }
}

/** Send the bare `/trending` to the trending films. */
export function openTrendingFilms(): never {
  throw redirect({ to: '/trending/$type', params: { type: 'movie' }, replace: true });
}
