import type { AgeRating } from '@kromatv/client/media';

/** What a title's metadata says about its age rating, as far as a badge cares. */
export type TitleAgeRating = { ageRating?: AgeRating | null };

/** The age rating a title's badge draws, or `null` for a title with no
 * metadata yet or one nobody rated. */
export function ageRatingOf(title: TitleAgeRating | null | undefined): AgeRating | null {
  return title?.ageRating ?? null;
}
