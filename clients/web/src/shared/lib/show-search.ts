import { z } from 'zod';

/** The season list's place on a show's page, which a link can jump to. */
export const EPISODES_ANCHOR = 'episodes';

const ShowSearchParams = z.object({
  season: z.coerce.number().int().nonnegative().optional().catch(undefined),
});

export interface ShowSearch {
  season?: number;
}

/** Validate a show page's search params. A season that makes no sense is dropped, and
 *  a dropped key is absent, not `undefined`, so it does not round-trip into the url. */
export function validateShowSearch(raw: Record<string, unknown>): ShowSearch {
  const { season } = ShowSearchParams.parse(raw);
  return season === undefined ? {} : { season };
}
