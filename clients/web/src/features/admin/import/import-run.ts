import type { Import, ImportReport, ImportStatus } from '@kromatv/client/imports';

/** The kinds an import counts, in the order the owner reads them. */
export const TALLY_KINDS = [
  'libraries',
  'users',
  'titles',
  'states',
  'plays',
] as const satisfies readonly (keyof ImportReport)[];

export type TallyKind = (typeof TALLY_KINDS)[number];

/** Whether an import is still at work, so that it must be asked about again. */
export function atWork(status: ImportStatus | undefined): boolean {
  return status === undefined || status === 'queued' || status === 'running';
}

/** The kinds an import read at least one of, with what it did of each. */
export function tallies(found: Import | undefined) {
  return TALLY_KINDS.map((kind) => ({ kind, tally: found?.report[kind] })).filter(
    (row) => (row.tally?.read ?? 0) > 0,
  );
}
