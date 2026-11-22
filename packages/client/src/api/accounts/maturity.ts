import { z } from 'zod';
import type { RequestContext } from '../../core/http';

/** The six levels a profile is held at, each the oldest age it admits: `0` is
 * All and `18` is 18+, the default, which hides nothing. */
export const MATURITY_LEVELS = [0, 7, 10, 13, 16, 18] as const;

export const MaturityLevel = z.union([
  z.literal(0),
  z.literal(7),
  z.literal(10),
  z.literal(13),
  z.literal(16),
  z.literal(18),
]);
export type MaturityLevel = z.infer<typeof MaturityLevel>;

/** `GET /api/auth/me/ratings`: the account's ratings country, `null` while it
 * follows the `household` one, and every country a person may pick. */
export const RatingsCountry = z.object({
  country: z.string().nonempty().nullable(),
  household: z.string().nonempty(),
  countries: z.array(z.string().nonempty()),
});
export type RatingsCountry = z.infer<typeof RatingsCountry>;

/** Whose age-rating labels the signed-in account reads. */
export function ratingsApi(ctx: RequestContext) {
  return {
    get: () => ctx.get('/auth/me/ratings', RatingsCountry),

    /** `null` follows the household's country again. */
    set: (country: string | null) =>
      ctx.put('/auth/me/ratings', RatingsCountry, { body: { country } }),
  };
}
