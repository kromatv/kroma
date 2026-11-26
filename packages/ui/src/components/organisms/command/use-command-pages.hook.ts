import { useState } from 'react';
import { useStableCallback } from '#ui/lib/stable-callback.hook';
import type { CommandAction, CommandItem } from './command-list';

interface Step {
  id: string;
  from: number;
  query: string;
}

interface Resume {
  scope: string;
  row: number;
}

interface PagesOptions {
  items: readonly CommandItem[];
  query: string;
  setQuery: (next: string) => void;
}

function pageAt(items: readonly CommandItem[], trail: readonly Step[]): CommandItem | undefined {
  let list = items;
  let page: CommandItem | undefined;
  for (const { id } of trail) {
    const found = list.find((item) => item.id === id);
    if (!found?.items) {
      break;
    }
    page = found;
    list = found.items;
  }
  return page;
}

/** Whether running `action` on `item` opens the item's own list rather than the action. */
function opensList(item: CommandItem, action: CommandAction | undefined): boolean {
  return item.items !== undefined && action === item.actions?.[0];
}

const scopeOf = (depth: number, query: string) => `${depth}\n${query}`;

/** The lists a palette has gone into from `items`, innermost last: the row whose list
 *  it shows now and that list, and the way in and back out. Going back puts back what
 *  was typed and the cursor on the row that was opened. A row that has gone is left. */
function useCommandPages({ items, query, setQuery }: PagesOptions) {
  const [trail, setTrail] = useState<readonly Step[]>([]);
  const [resume, setResume] = useState<Resume | null>(null);
  const page = pageAt(items, trail);
  const depth = page ? trail.length : 0;
  const scope = scopeOf(depth, query);

  const back = useStableCallback(() => {
    const step = trail.at(-1);
    if (!step) {
      return;
    }
    setResume({ scope: scopeOf(trail.length - 1, step.query), row: step.from });
    setTrail(trail.slice(0, -1));
    setQuery(step.query);
  });

  const enter = useStableCallback((item: CommandItem, from: number) => {
    setTrail([...trail, { id: item.id, from, query }]);
    setQuery('');
  });

  return {
    page,
    listed: page?.items ?? items,
    depth,
    scope,
    start: resume?.scope === scope ? resume.row : 0,
    back,
    backspace: depth > 0 && query === '' ? back : undefined,
    enter,
  };
}

type CommandPages = ReturnType<typeof useCommandPages>;

export type { CommandPages };
export { opensList, useCommandPages };
