import type { Rendered } from './engine';

const BASE = 'core';
const UNANSWERED = 'missing';

/** What a message renders as while the key switch is on: `[core/player.play]`
 *  for an app key, `[tv.kroma.torrents/queue.title]` for one a module's own
 *  catalog answered, `[missing/foo]` for one nothing answers, and
 *  `[core@en/foo]` where the answer came from the fallback locale. */
export function keyLabel({ key, from, locale }: Rendered): string {
  if (!from) return `[${UNANSWERED}/${key}]`;
  const scope = from.scope ?? BASE;
  const answered = from.locale === locale ? scope : `${scope}@${from.locale}`;
  return `[${answered}/${key}]`;
}
