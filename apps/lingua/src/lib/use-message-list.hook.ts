import { useState } from 'react';
import { filterCounts, listedKeys, type MessageGroup, type RowFilter } from '#site/lib/row-filter';

/**
 * Which messages the editor lists: the filter and the search, taken as a
 * snapshot when either changes so a message does not leave the list while it
 * is being worked on; the message a link names always stays.
 */
export function useMessageList(groups: readonly MessageGroup[], linked: string | null) {
  const [filter, setFilter] = useState<RowFilter>('all');
  const [query, setQuery] = useState('');
  const [listed, setListed] = useState<ReadonlySet<string> | null>(null);
  const onFilterChange = (next: RowFilter) => {
    setFilter(next);
    setListed(listedKeys(groups, next, query));
  };
  const onQueryChange = (next: string) => {
    setQuery(next);
    setListed(listedKeys(groups, filter, next));
  };
  const reset = () => {
    setFilter('all');
    setQuery('');
    setListed(null);
  };
  const shown = listed
    ? groups.filter(
        (group) => listed.has(group.key) || group.rows.some((row) => row.key === linked),
      )
    : groups;
  const list = { query, onQueryChange, filter, onFilterChange, counts: filterCounts(groups) };
  return { list, shown, narrowed: listed !== null, reset };
}
