// What <ListRow>'s parts share: the shell size the Root settled on, and the
// styles it already resolved for them.

import { createContext, useContext } from 'react';
import type { ControlMetrics, ControlSize } from '#ui/lib/field-shell';
import type { listRowVariants } from './list-row-variants';

interface ListRowState {
  size: ControlSize;
  metrics: ControlMetrics;
  slots: ReturnType<typeof listRowVariants>;
}

const ListRowContext = createContext<ListRowState | null>(null);

function useListRow(part: string): ListRowState {
  const state = useContext(ListRowContext);
  if (!state) throw new Error(`<ListRow.${part}> must be used inside <ListRow.Root>`);
  return state;
}

export type { ListRowState };
export { ListRowContext, useListRow };
