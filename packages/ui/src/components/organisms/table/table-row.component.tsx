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
import { type StyleScope, sharedStyle, styles, useStyleScope } from '#ui/core';
import type { Radius } from '#ui/core/tokens/layout';
import { useStyles } from '#ui/core/styles';
import { useRingScope } from '#ui/lib/ring-scope';
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
  const s = useStyles(sDefinition);

  const scope = useStyleScope();
  const corner = useRingScope()?.corner ?? 0;
  const { variant, head, ruled } = useTable('Row');
  const host = asChild ? hostOf(children) : null;
  const cells = useMemo(() => parts(host ? host.props.children : children), [host, children]);
  const places = cells.map((_, at) => ({ variant, head, ruled, at, of: cells.length }));
  const face = (
    <>
      {ruled ? <Box pointerEvents="none" style={[s.rule, ruleReach(corner, scope)]} /> : null}
      <Placed places={places} items={cells} />
    </>
  );
  if (!host) {
    return (
      <Box role="row" style={s.row}>
        {face}
      </Box>
    );
  }
  return (
    <Focusable asChild states={ROW_STATES} style={s.row}>
      {cloneElement(host, { role: 'row', children: face })}
    </Focusable>
  );
}

const ROW_STATES = { hover: { bg: 'tint/7' }, press: { bg: 'tint/12' } } as const;

const sDefinition = styles({
  row: { row: true, position: 'relative' },
  rule: { position: 'absolute', top: 0, h: 1, bg: 'border' },
});

const ruleReach = (corner: Radius, scope: StyleScope) =>
  sharedStyle(`table:rule:${corner}`, { start: corner, end: corner }, scope);

export type { TableRowProps };
export { Row };
