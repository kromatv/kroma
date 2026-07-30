// Responsive poster grid, sizing cards to fill the row exactly. It measures its
// own width rather than the window's: inside a <Screen> the horizontal
// safe-area insets are already consumed, and window-width math overflows.

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
  empty?: React.ReactElement;
  refreshing?: boolean;
  onRefresh?: () => void;
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
