import { type NodeConfig, SpatialNavigator } from '@kroma/spatial-nav';

type Callbacks = Pick<NodeConfig, 'onFocus' | 'onBlur' | 'onActive' | 'onInactive' | 'onSelect'>;

interface Tracker {
  focusedIds: Set<string>;
  events: string[];
  on: (id: string) => Callbacks;
}

interface Board extends Tracker {
  nav: SpatialNavigator;
}

/** Records what the tree told each node, so a test can count focus owners
 *  rather than trust the navigator's own answer for how many there are. */
function tracker(): Tracker {
  const focusedIds = new Set<string>();
  const events: string[] = [];
  const on = (id: string): Callbacks => ({
    onFocus: () => {
      focusedIds.add(id);
      events.push(`focus:${id}`);
    },
    onBlur: () => {
      focusedIds.delete(id);
      events.push(`blur:${id}`);
    },
    onActive: () => events.push(`active:${id}`),
    onInactive: () => events.push(`inactive:${id}`),
    onSelect: () => events.push(`select:${id}`),
  });
  return { focusedIds, events, on };
}

/**
 * A page of horizontal rows (`row0`, `row1`, ...) under one vertical container
 * called `page`, every leaf focusable and every node reporting to the tracker.
 * `align` makes the page a grid: see {@link NodeConfig.alignInGrid}.
 */
function board(rows: readonly (readonly string[])[], align = false): Board {
  const track = tracker();
  const nav = new SpatialNavigator();
  nav.registerNode('page', { orientation: 'vertical', alignInGrid: align, ...track.on('page') });
  rows.forEach((items, index) => {
    const id = `row${index}`;
    nav.registerNode(id, { parent: 'page', orientation: 'horizontal', ...track.on(id) });
    for (const item of items) {
      nav.registerNode(item, { parent: id, focusable: true, ...track.on(item) });
    }
  });
  return { nav, ...track };
}

/** One horizontal row, `row0`, holding the given leaves. */
function row(items: readonly string[]): Board {
  return board([items]);
}

export type { Board, Tracker };
export { board, row, tracker };
