import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useMemo,
} from 'react';
import type { Role } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { styles } from '#ui/core';
import { useTable } from './table-context';
import { Placed, parts } from './table-place';

interface TableRowProps {
  /** Render onto the one element the children name, so a row that goes
   *  somewhere is a real link. The row keeps its `role="row"`. */
  asChild?: boolean;
  /** A DIRECT <Table.Cell> child per column. Under `asChild` it is instead the
   *  one element the row renders as, whose own children are the cells. */
  children?: ReactNode;
}

type RowHost = ReactElement<{ children?: ReactNode; role?: Role }>;

function hostOf(children: ReactNode): RowHost {
  const host = Children.only(children);
  if (!isValidElement<{ children?: ReactNode; role?: Role }>(host)) {
    throw new Error('asChild needs exactly one element child');
  }
  return host;
}

function Row({ asChild = false, children }: Readonly<TableRowProps>) {
  const { variant, head, ruled } = useTable('Row');
  const host = asChild ? hostOf(children) : null;
  const cells = useMemo(() => parts(host ? host.props.children : children), [host, children]);
  const places = useMemo(
    () => cells.map((_, at) => ({ variant, head, ruled, at })),
    [variant, head, ruled, cells],
  );
  const placed = <Placed places={places} items={cells} />;
  if (!host) {
    return (
      <Box row role="row" style={ruled ? s.rule : undefined}>
        {placed}
      </Box>
    );
  }
  return (
    <Focusable asChild ring="focusEdge" states={ROW_STATES} style={[s.row, ruled ? s.rule : null]}>
      {cloneElement(host, { role: 'row', children: placed })}
    </Focusable>
  );
}

const ROW_STATES = { hover: { bg: 'tint/7' }, press: { bg: 'tint/12' } } as const;

const s = styles({
  row: { row: true },
  rule: { borderTopWidth: 1, borderTopColor: 'border' },
});

export type { TableRowProps };
export { Row };
