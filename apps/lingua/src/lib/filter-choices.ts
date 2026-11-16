import type { ColorToken } from '@kromatv/ui/kit';
import type { NamespaceFilter } from '#site/lib/namespace-filter';
import type { RowFilter } from '#site/lib/row-filter';

/** One filter a list offers: its value, its name, its status colour and how many it lists. */
export interface FilterChoice<F extends string> {
  value: F;
  label: string;
  count: number;
  dot?: ColorToken;
}

/** The editor's filters, with how many messages each lists. */
export function messageFilters(counts: Record<RowFilter, number>): FilterChoice<RowFilter>[] {
  return [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'missing', label: 'Missing', count: counts.missing, dot: 'danger' },
    { value: 'outdated', label: 'Outdated', count: counts.outdated, dot: 'accent' },
    { value: 'unreviewed', label: 'Unreviewed', count: counts.unreviewed, dot: 'info' },
    { value: 'mine', label: 'My edits', count: counts.mine },
  ];
}

/** A language page's filters, with how many sections each lists. */
export function sectionFilters(
  counts: Record<NamespaceFilter, number>,
): FilterChoice<NamespaceFilter>[] {
  return [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'incomplete', label: 'Missing', count: counts.incomplete, dot: 'danger' },
    { value: 'outdated', label: 'Outdated', count: counts.outdated, dot: 'accent' },
    { value: 'unreviewed', label: 'Unreviewed', count: counts.unreviewed, dot: 'info' },
    { value: 'mine', label: 'My edits', count: counts.mine },
  ];
}

/** The filters worth a chip: the first, the one in force, and any that lists something. */
export function shownFilters<F extends string>(
  choices: readonly FilterChoice<F>[],
  current: F,
): FilterChoice<F>[] {
  return choices.filter((choice, at) => at === 0 || choice.count > 0 || choice.value === current);
}
