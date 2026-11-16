import type { MessageHit } from '#site/lib/views';

const MESSAGE_HITS = 50;

const FIELD_WEIGHT = { key: 3, source: 2, text: 2 } as const;

function fieldScore(text: string | null, wanted: string): number {
  const said = (text ?? '').toLocaleLowerCase();
  if (said === wanted) {
    return 4;
  }
  if (said.startsWith(wanted)) {
    return 2;
  }
  return said.includes(wanted) ? 1 : 0;
}

function scoreOf(hit: MessageHit, wanted: string): number {
  return (
    fieldScore(hit.key, wanted) * FIELD_WEIGHT.key +
    fieldScore(hit.source, wanted) * FIELD_WEIGHT.source +
    fieldScore(hit.text, wanted) * FIELD_WEIGHT.text
  );
}

/**
 * The messages of `messages` that mention `query` in their key, their source or
 * their translation, ignoring case, the closest first and at most `limit` of
 * them. A query under two characters finds nothing.
 */
export function searchMessages(
  messages: readonly MessageHit[],
  query: string,
  limit = MESSAGE_HITS,
): MessageHit[] {
  const wanted = query.trim().toLocaleLowerCase();
  if (wanted.length < 2) {
    return [];
  }
  return messages
    .map((hit, at) => ({ hit, at, score: scoreOf(hit, wanted) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, limit)
    .map(({ hit }) => hit);
}
