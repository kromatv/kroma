import type { ReactNode } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { NaturalWidth } from '#ui/lib/natural-width.component';
import { CellText } from './table-cell-text.component';
import type { TableColumn } from './table-columns';
import { SORT_GLYPH, type SortPlace, sortClaim, sortPlace, type TableSort } from './table-sort';

interface SortCellProps {
  column: string;
  align?: NonNullable<TableColumn['align']>;
  sort: TableSort;
  box: StyleProp<ViewStyle>;
  pad: StyleProp<ViewStyle>;
  bleed: StyleProp<ViewStyle>;
  seam: ReactNode;
  onLayout: ((event: LayoutChangeEvent) => void) | undefined;
  onHeadingWidth: ((width: number) => void) | undefined;
  children?: ReactNode;
}

function SortFace({
  place,
  ranked,
  children,
}: Readonly<{ place: SortPlace | null; ranked: boolean; children?: ReactNode }>) {
  return (
    <>
      <CellText face={place ? 'sorted' : 'head'}>{children}</CellText>
      <Icon
        name={SORT_GLYPH[place?.direction ?? 'none']}
        size={14}
        thickness={2.2}
        color={place ? 'accent' : 'textDim'}
      />
      {place && ranked ? (
        <Text variant="overline" color="accentText">
          {place.rank}
        </Text>
      ) : null}
    </>
  );
}

function SortCell({
  column,
  align,
  sort,
  box,
  pad,
  bleed,
  seam,
  onLayout,
  onHeadingWidth,
  children,
}: Readonly<SortCellProps>) {
  const s = useStyles(sDefinition);

  const place = sortPlace(sort.columns, column);
  const press = sort.press;
  const face = (
    <SortFace place={place} ranked={sort.columns.length > 1}>
      {children}
    </SortFace>
  );
  const inside = [bleed, pad, s.head, align === 'end' ? s.end : null];
  return (
    <Box
      role="columnheader"
      style={[box, pad]}
      onLayout={onLayout}
      {...sortClaim(place?.direction ?? 'none')}
    >
      {press ? (
        <Focusable states={HEAD_STATES} style={inside} onPress={() => press(column)}>
          {face}
        </Focusable>
      ) : (
        <Box style={inside}>{face}</Box>
      )}
      {onHeadingWidth ? (
        <NaturalWidth style={[pad, s.face]} onWidth={onHeadingWidth}>
          {face}
        </NaturalWidth>
      ) : null}
      {seam}
    </Box>
  );
}

const HEAD_STATES = { hover: { bg: 'tint/10' }, press: { bg: 'tint/18' } } as const;

const GAP = 6;

const sDefinition = styles({
  head: { flex: true, row: true, align: 'center', justify: 'flex-start', gap: GAP, minW: 0 },
  face: { gap: GAP },
  end: { justify: 'flex-end' },
});

export { SortCell };
