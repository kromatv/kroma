// Responsive poster grid. One source of truth for the column math: the grid
// derives columns from breakpoints and sizes cards to fill the row exactly, so
// no gutter is left over on the right.
//
// The grid measures its OWN width instead of trusting the window: inside a
// <Screen> the horizontal safe-area insets (notch in landscape) are already
// consumed by the container, and window-width math overflowed the row.

import { useState } from 'react';
import { FlatList } from 'react-native';
import { spacing, TAB_BAR_CLEARANCE } from '#mobile/lib/theme';
import { type CardModel, PosterCard } from './cards';

const GAP = 12;

export function gridMetrics(
  width: number,
  gutterSum: number = spacing.md * 2,
): { cols: number; cardW: number } {
  let cols = 3;
  if (width >= 1000) cols = 6;
  else if (width >= 700) cols = 5;
  else if (width >= 500) cols = 4;
  const cardW = Math.floor((width - gutterSum - GAP * (cols - 1)) / cols);
  return { cols, cardW };
}

export function PosterGrid({
  cards,
  header,
  empty,
  refreshing,
  onRefresh,
  gutters,
}: Readonly<{
  cards: CardModel[];
  header?: React.ReactElement;
  /** Centered placeholder when there is nothing to show. */
  empty?: React.ReactElement;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Horizontal content padding. Pages sitting on the raw window (the tabs)
   * pass `useGutters()` so landscape clears the notch; pages already inside an
   * inset-padded <Screen> keep the plain default. */
  gutters?: { left: number; right: number };
}>) {
  const [listW, setListW] = useState<number | null>(null);
  const pad = gutters ?? { left: spacing.md, right: spacing.md };
  const { cols, cardW } = gridMetrics(listW ?? 0, pad.left + pad.right);
  return (
    <FlatList
      key={cols}
      onLayout={(e) => setListW(e.nativeEvent.layout.width)}
      data={listW === null ? [] : cards}
      numColumns={cols}
      keyExtractor={(c) => c.key}
      renderItem={({ item }) => <PosterCard card={item} width={cardW} />}
      columnWrapperStyle={cols > 1 ? { gap: GAP } : undefined}
      contentContainerStyle={{
        paddingLeft: pad.left,
        paddingRight: pad.right,
        paddingBottom: TAB_BAR_CLEARANCE,
        gap: spacing.md,
        flexGrow: cards.length === 0 ? 1 : undefined,
      }}
      ListHeaderComponent={header}
      ListEmptyComponent={listW === null ? undefined : empty}
      refreshing={refreshing}
      onRefresh={onRefresh}
      initialNumToRender={12}
      removeClippedSubviews
    />
  );
}
