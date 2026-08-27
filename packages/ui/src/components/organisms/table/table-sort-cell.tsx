import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import type { TableColumn } from './table-columns';
import { SORT_GLYPH, sortClaim, sortPlace, type TableSort } from './table-sort';

interface SortCellProps {
  column: string;
  align?: NonNullable<TableColumn['align']>;
  sort: TableSort;
  box: StyleProp<ViewStyle>;
  pad: StyleProp<ViewStyle>;
  children?: ReactNode;
}

function SortCell({ column, align, sort, box, pad, children }: Readonly<SortCellProps>) {
  const place = sortPlace(sort.columns, column);
  const state = place?.direction ?? 'none';
  const press = sort.press;
  const face = (
    <>
      {children}
      <Icon name={SORT_GLYPH[state]} size={14} thickness={2.2} color={place ? 'text' : 'textDim'} />
      {place && sort.columns.length > 1 ? (
        <Text variant="overline" color="accentText">
          {place.rank}
        </Text>
      ) : null}
    </>
  );
  const inside = [s.head, pad, align === 'end' ? s.end : null];
  return (
    <Box role="columnheader" style={box} {...sortClaim(state)}>
      {press ? (
        <Focusable
          ring="focusEdge"
          states={HEAD_STATES}
          style={inside}
          onPress={() => press(column)}
        >
          {face}
        </Focusable>
      ) : (
        <Box style={inside}>{face}</Box>
      )}
    </Box>
  );
}

const HEAD_STATES = { hover: { bg: 'tint/10' }, press: { bg: 'tint/18' } } as const;

const s = styles({
  head: { flex: true, row: true, align: 'center', gap: 6, minW: 0 },
  end: { justify: 'flex-end' },
});

export { SortCell };
