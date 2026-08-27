import type { ReactNode } from 'react';
import { partContext } from '#ui/lib/part-context';

/** How a table meets the page: as a card of its own (`framed`), or as ruled
 * rows flush with the column of text around it (`plain`). */
type TableVariant = 'framed' | 'plain';

interface Place {
  variant: TableVariant;
  head: boolean;
  ruled: boolean;
  at: number;
}

interface TableSectionProps {
  /** A DIRECT <Table.Row> child. */
  children?: ReactNode;
}

const [TableContext, useTable] = partContext<Place>('Table.Root');

export type { Place, TableSectionProps, TableVariant };
export { TableContext, useTable };
