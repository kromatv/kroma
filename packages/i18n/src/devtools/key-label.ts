import type { KeyInspector } from '../dev-overrides';

const BASE = 'core';
const UNANSWERED = 'missing';

/** What a message renders as while the key inspector is installed:
 *  `[core/player.play]` for an app key, `[tv.kroma.torrents/queue.title]` for one
 *  a module's own catalog answered, `[missing/foo]` for one nothing answers, and
 *  `[core@en/foo]` when the answer came from the fallback locale. */
export const keyLabel: KeyInspector = (key, from, locale) => {
  if (!from) return `[${UNANSWERED}/${key}]`;
  const scope = from.scope ?? BASE;
  return `[${from.locale === locale ? scope : `${scope}@${from.locale}`}/${key}]`;
};
