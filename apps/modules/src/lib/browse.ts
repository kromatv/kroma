import { matches } from '@kroma/registry';
import { type Page, paginate } from '@kroma/ui/kit/molecules/pagination';
import { useMemo, useState } from 'react';
import type { ModuleEntry } from '#site/catalog';

const PAGE_SIZE = 8;

export interface Browse extends Page<ModuleEntry> {
  query: string;
  search: (next: string) => void;
  goTo: (next: number) => void;
}

/** The matched set in words: a total on one page, a range over several. */
export function sliceLabel(b: Pick<Browse, 'first' | 'last' | 'total'>): string {
  const noun = b.total === 1 ? 'module' : 'modules';
  if (b.first === 1 && b.last === b.total) return `${b.total} ${noun}`;
  return `${b.first}-${b.last} of ${b.total} ${noun}`;
}

/** Query and page state over a loaded catalog. A new query returns to page 1. */
export function useModuleBrowse(modules: readonly ModuleEntry[]): Browse {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const found = useMemo(() => modules.filter((m) => matches(m, query)), [modules, query]);
  const slice = paginate(found, page, PAGE_SIZE);
  return {
    ...slice,
    query,
    search: (next: string) => {
      setQuery(next);
      setPage(1);
    },
    goTo: (next: number) => setPage(Math.min(Math.max(1, next), slice.pageCount)),
  };
}
