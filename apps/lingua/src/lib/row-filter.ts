import type { RowView } from '#site/lib/views';

/** Which messages the editor lists: every one, the untranslated, outdated or unreviewed ones, or the ones the viewer worked on. */
export type RowFilter = 'all' | 'missing' | 'outdated' | 'unreviewed' | 'mine';

/** One message as the editor shows it: its key, and its rows, which are its plural forms when it has them. */
export interface MessageGroup {
  key: string;
  rows: RowView[];
}

/** Where a message stands for the viewer, the state that asks the most of them first. */
export type GroupStatus =
  | 'missing'
  | 'draft'
  | 'proposed'
  | 'confirmed'
  | 'outdated'
  | 'unreviewed'
  | 'translated';

/** Whether a message has no text yet, counting the viewer's draft as text. */
export function isUntranslated(row: RowView): boolean {
  return (row.draft ?? row.current ?? '').trim() === '';
}

const FORM_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other'];

const formRank = (row: RowView) => FORM_ORDER.indexOf(row.plural ?? 'other');

/** The rows of one catalog file, each plural form kept with the message it is a form of, in CLDR order: `one` before `other`. */
export function groupRows(rows: readonly RowView[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    const isForm = row.plural !== null && row.plural !== 'other';
    if (isForm && last && row.key === `${last.key}_${row.plural}`) {
      last.rows.push(row);
    } else {
      groups.push({ key: row.key, rows: [row] });
    }
  }
  for (const group of groups) {
    group.rows.sort((a, b) => formRank(a) - formRank(b));
  }
  return groups;
}

const awaiting = (row: RowView, state: 'outdated' | 'unreviewed') =>
  row.state === state && row.draft === null && !row.confirmed;

/** Where `group` stands: missing text first, then the viewer's own work, then what the lock says. */
export function statusOf({ rows }: MessageGroup): GroupStatus {
  if (rows.some(isUntranslated)) {
    return 'missing';
  }
  if (rows.some((row) => row.draft !== null && !row.proposed)) {
    return 'draft';
  }
  if (rows.some((row) => row.proposed)) {
    return 'proposed';
  }
  if (rows.some((row) => row.confirmed)) {
    return 'confirmed';
  }
  if (rows.some((row) => awaiting(row, 'outdated'))) {
    return 'outdated';
  }
  return rows.some((row) => awaiting(row, 'unreviewed')) ? 'unreviewed' : 'translated';
}

/** Whether `group` asks to be confirmed: its text stands, but the source moved or a machine wrote it. */
export function needsConfirm({ rows }: MessageGroup): boolean {
  return rows.some((row) => awaiting(row, 'outdated') || awaiting(row, 'unreviewed'));
}

/** Whether `group` belongs in the list under `filter`. */
export function matchesRowFilter({ rows }: MessageGroup, filter: RowFilter): boolean {
  switch (filter) {
    case 'missing':
      return rows.some(isUntranslated);
    case 'outdated':
    case 'unreviewed':
      return rows.some((row) => awaiting(row, filter));
    case 'mine':
      return rows.some((row) => row.draft !== null || row.confirmed);
    default:
      return true;
  }
}

/** Whether `group` mentions `query` in its key, its source or its text, ignoring case. */
export function matchesQuery({ key, rows }: MessageGroup, query: string): boolean {
  const wanted = query.trim().toLocaleLowerCase();
  if (wanted === '') {
    return true;
  }
  const said = rows.flatMap((row) => [row.source, row.current ?? '', row.draft ?? '']);
  return [key, ...said].some((text) => text.toLocaleLowerCase().includes(wanted));
}

/** How many messages each filter lists. */
export function filterCounts(groups: readonly MessageGroup[]): Record<RowFilter, number> {
  const count = (filter: RowFilter) => groups.filter((g) => matchesRowFilter(g, filter)).length;
  return {
    all: groups.length,
    missing: count('missing'),
    outdated: count('outdated'),
    unreviewed: count('unreviewed'),
    mine: count('mine'),
  };
}

/** The keys the list shows under `filter` and `query`, or null when it shows every message. */
export function listedKeys(
  groups: readonly MessageGroup[],
  filter: RowFilter,
  query: string,
): ReadonlySet<string> | null {
  if (filter === 'all' && query.trim() === '') {
    return null;
  }
  const shown = groups.filter((g) => matchesRowFilter(g, filter) && matchesQuery(g, query));
  return new Set(shown.map((g) => g.key));
}

/** The notes every message of a section carries, which the editor shows once above them all. */
export function sharedNotes(groups: readonly MessageGroup[]): string[] {
  const [first, ...rest] = groups.map((group) => group.rows[0]?.notes ?? []);
  if (!first || rest.length === 0) {
    return [];
  }
  return first.filter((note) => rest.every((notes) => notes.includes(note)));
}
