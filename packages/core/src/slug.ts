// The combining-marks range, not `\p{M}`: this module ships to the legacy webOS
// tier, whose engine cannot parse unicode property escapes.

/** The URL segment a display name folds to: lowercased, accents dropped, every
 * run of anything else turned into one `-`, with no leading or trailing one.
 * Idempotent: a slug read back off a URL folds to itself. */
export function slugify(raw: string): string {
  const dashed = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  // Sliced rather than trimmed with `/^-+|-+$/`: the collapse above is greedy,
  // so a run of anything else is already exactly one dash and there is at most
  // one at each end. An anchored quantifier would scan a string of nothing but
  // dashes from every position for a match that cannot be there.
  return dashed.slice(dashed.startsWith('-') ? 1 : 0, dashed.endsWith('-') ? -1 : undefined);
}
