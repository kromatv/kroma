import type { RowView } from '#site/lib/views';

/** Which messages the editor lists: every one, the untranslated ones, or the ones the viewer edited. */
export type RowFilter = 'all' | 'missing' | 'mine';

/** Whether a message has no text yet, counting the viewer's draft as text. */
export function isUntranslated(row: RowView): boolean {
  return (row.draft ?? row.current ?? '').trim() === '';
}

/** Whether `row` belongs in the list under `filter`. */
export function matchesRowFilter(row: RowView, filter: RowFilter): boolean {
  if (filter === 'missing') {
    return isUntranslated(row);
  }
  if (filter === 'mine') {
    return row.draft !== null;
  }
  return true;
}
