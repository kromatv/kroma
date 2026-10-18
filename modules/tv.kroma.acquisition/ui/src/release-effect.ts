import type { ScoredReleaseView } from '@kromatv/client/requests';

export type Effect = 'fill' | 'upgrade' | 'beside' | 'notBetter' | 'refused';

const ORDER: readonly Effect[] = ['fill', 'upgrade', 'beside', 'notBetter', 'refused'];

export const EFFECT_GROUP: Record<Effect, string> = {
  fill: 'acq.effect.fill',
  upgrade: 'acq.effect.upgrade',
  beside: 'acq.effect.beside',
  notBetter: 'acq.effect.notBetter',
  refused: 'acq.effect.refused',
};

export const EFFECT_DOT = {
  fill: 'success',
  upgrade: 'accent',
  beside: 'info',
  notBetter: 'textDim',
  refused: 'dangerHover',
} as const satisfies Record<Effect, string>;

/** What grabbing a release would do, refused when a rule turns it down. */
export function effectOf(release: Pick<ScoredReleaseView, 'score' | 'verdict'>): Effect {
  if (release.score == null) return 'refused';
  return release.verdict?.kind ?? 'notBetter';
}

/** The rows split by what grabbing them would do, best effect first, each
 *  group in the order the rows came. Empty groups are left out. */
export function groupByEffect<Row extends Pick<ScoredReleaseView, 'score' | 'verdict'>>(
  rows: readonly Row[],
): { effect: Effect; rows: Row[] }[] {
  return ORDER.map((effect) => ({
    effect,
    rows: rows.filter((row) => effectOf(row) === effect),
  })).filter((group) => group.rows.length > 0);
}
