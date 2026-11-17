import type { Variable } from '#site/lib/placeables';
import type { Issue } from '#site/lib/views';

const SHOWN_AS_VARIABLES = new Set<Issue['code']>(['unknown-token', 'missing-token']);

/**
 * The issues a field lists under it. A placeholder the source does not pass is
 * read off the text as it is typed, so the sentence goes the moment the
 * placeholder does; the rest is what the last save `found`, less what the
 * variables line already shows.
 */
export function fieldIssues(variables: readonly Variable[], found: readonly Issue[]): Issue[] {
  const unknown = variables
    .filter((variable) => variable.state === 'unknown')
    .map((variable): Issue => ({ level: 'error', code: 'unknown-token', detail: variable.name }));
  return [...unknown, ...found.filter((issue) => !SHOWN_AS_VARIABLES.has(issue.code))];
}
