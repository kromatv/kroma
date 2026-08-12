// <Table>: rows of the same shape, read down a column as much as across a row.
//
// There is no <table> on a television, so the grid is Yoga's: a row is a flex
// row and a cell is a flex child of it. That has one consequence worth knowing
// before writing one - a column is as wide as the cells in it, and the cells of
// two different rows do not agree with each other unless every row holds the
// same number of them.
//
// Nothing here can ask a child where it sits: Yoga has no `order` and there is
// no `:first-child`. So each level hands its own direct children their position
// once, and a rule is drawn by the row UNDER the seam rather than by the one
// above it, which is what keeps a table from doubling its own bottom border.

import { Children, isValidElement, type ReactNode, useMemo } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { space } from '#ui/core/tokens';
import { partContext } from '#ui/lib/part-context';

/** How a table meets the page: as a card of its own (`framed`), or as ruled
 * rows flush with the column of text around it (`plain`). */
type TableVariant = 'framed' | 'plain';

interface Context {
  variant: TableVariant;
  head: boolean;
  /** Nothing is drawn above this part inside the table, so it carries no rule. */
  top: boolean;
}

const [TableContext, useTable] = partContext<Context>('Table.Root');

// Only an element can be handed a position, and a table's children are always
// parts: anything else is dropped rather than left to shift the grid.
function parts(children: ReactNode): ReactNode[] {
  return Children.toArray(children).filter((child) => isValidElement(child));
}

function Placed({ items, places }: Readonly<{ items: ReactNode[]; places: Context[] }>) {
  return (
    <>
      {items.map((child, at) => (
        // The position is the identity: this is the caller's own list, in the
        // order it was written, and nothing reorders it.
        // biome-ignore lint/suspicious/noArrayIndexKey: the position IS what the provider carries
        <TableContext.Provider key={at} value={places[at] as Context}>
          {child}
        </TableContext.Provider>
      ))}
    </>
  );
}

interface TableRootProps {
  /** Defaults to `framed`. */
  variant?: TableVariant;
  /** Names the table to assistive tech. Draws nothing. */
  label?: string;
  /** A DIRECT <Table.Header>, <Table.Body> or <Table.Row> child: only a direct
   *  child is given its position, and only a part that reads it is ruled. */
  children?: ReactNode;
}

function Root({ variant = 'framed', label, children }: Readonly<TableRootProps>) {
  const sections = useMemo(() => parts(children), [children]);
  const places = useMemo(
    () => sections.map((_, at) => ({ variant, head: false, top: at === 0 })),
    [variant, sections],
  );
  return (
    <Box role="table" aria-label={label} style={variant === 'framed' ? s.framed : undefined}>
      <Placed places={places} items={sections} />
    </Box>
  );
}

interface TableSectionProps {
  /** A DIRECT <Table.Row> child. */
  children?: ReactNode;
}

function Section({ head, children }: Readonly<{ head: boolean } & TableSectionProps>) {
  const { variant, top } = useTable(head ? 'Header' : 'Body');
  const rows = useMemo(() => parts(children), [children]);
  const places = useMemo(
    () => rows.map((_, at) => ({ variant, head, top: top && at === 0 })),
    [variant, head, top, rows],
  );
  return (
    <Box role="rowgroup" bg={head && variant === 'framed' ? 'surface2' : undefined}>
      <Placed places={places} items={rows} />
    </Box>
  );
}

/** The heading row: its cells name their columns rather than filling them. */
function Header({ children }: Readonly<TableSectionProps>) {
  return <Section head>{children}</Section>;
}

/** The rows the table is about. */
function Body({ children }: Readonly<TableSectionProps>) {
  return <Section head={false}>{children}</Section>;
}

interface TableRowProps {
  /** A DIRECT <Table.Cell> child per column. */
  children?: ReactNode;
}

function Row({ children }: Readonly<TableRowProps>) {
  const { top } = useTable('Row');
  return (
    <Box row role="row" style={top ? undefined : s.rule}>
      {children}
    </Box>
  );
}

interface TableCellProps {
  /** A string is set in the table's own type, in the head's ink or the body's;
   *  anything else is drawn as it was written. */
  children?: ReactNode;
}

function Cell({ children }: Readonly<TableCellProps>) {
  const { head, variant } = useTable('Cell');
  return (
    // `minW: 0` is what lets a long cell wrap inside its column instead of
    // widening it past the ones beside it.
    <Box
      flex
      minW={0}
      role={head ? 'columnheader' : 'cell'}
      style={variant === 'framed' ? s.cell : s.cellPlain}
    >
      {typeof children === 'string' ? (
        <Text variant={head ? 'label' : 'body'} color={head ? 'text' : 'textMuted'}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Box>
  );
}

const s = styles({
  framed: { border: 'border', radius: 'md', bg: 'surface1', overflow: 'hidden' },
  rule: { borderTopWidth: 1, borderTopColor: 'border' },
  cell: { px: space[3], py: space[2] },
  // Flush with the text around it: a plain table has no frame to be inset from,
  // and its first column has to line up with the paragraph above it.
  cellPlain: { py: space[3] },
});

/**
 * Rows of the same shape.
 *
 * ```tsx
 * <Table.Root label="Modules">
 *   <Table.Header>
 *     <Table.Row>
 *       <Table.Cell>Module</Table.Cell>
 *       <Table.Cell>Port</Table.Cell>
 *     </Table.Row>
 *   </Table.Header>
 *   <Table.Body>
 *     <Table.Row>
 *       <Table.Cell>tv.kroma.torrents</Table.Cell>
 *       <Table.Cell>41310</Table.Cell>
 *     </Table.Row>
 *   </Table.Body>
 * </Table.Root>
 * ```
 */
const Table = { Root, Header, Body, Row, Cell };

export type { TableCellProps, TableRootProps, TableRowProps, TableSectionProps, TableVariant };
export { Table };
