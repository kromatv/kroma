// `genreIcon` in the published kit.
//
// It maps KROMA's own genre vocabulary, and resolving a genre written as a
// display name rather than a slug goes through the app's catalogs, which is the
// last thread that would drag them into this package. A consumer has no use for
// KROMA's genre table, so here the answer is always `undefined` and `<Icon>`
// draws whatever fallback the caller passes.

import type { IconName } from '#ui/lib/glyph';

/** Always `undefined` in the published package: see the note above. */
export function genreIcon(_name: string): IconName | undefined {
  return undefined;
}
