import type { ReactElement } from 'react';
import type { ViewStyle } from 'react-native';

/** What <VirtualGrid> takes. */
export interface VirtualGridProps<T> {
  data: readonly T[];
  /** The narrowest a tile may be. The grid fits as many as the room allows, the
   *  way `auto-fill` does in CSS and `<Grid min>` does for a static grid. */
  min?: number;
  /** A fixed column count, for a design that demands one whatever the width.
   *  Wins over `min`. */
  columns?: number;
  /** Tile height ÷ tile width (a 2:3 poster is 1.5), which with the measured
   *  cell width is the row pitch. */
  ratio?: number;
  /** An explicit tile height in px, for tiles that are not `ratio`-shaped. Wins
   *  over `ratio`; `rowGap` is added to it the same way. */
  itemHeight?: number;
  /** Between tiles in a row, and what the column maths removes. */
  gap?: number;
  /** Between rows. Defaults to `gap`. */
  rowGap?: number;
  /** Inset of the rows. Not of the viewport, which is what clips: padding there
   *  would inset the clip and shave the rows. */
  px?: number;
  /** Room above the first row, for a focused tile's ring and scale: the strip
   *  parks the top row at the content origin and the clip is flush there. */
  pt?: number;
  /** The box width to assume until the grid has measured its own: the design
   *  width. Without one the first frame has no columns to draw. */
  width?: number;
  /** Given the tile's index and the pixel width of the cell it lands in, so a
   *  tile can size its own artwork request to the column it is drawn at. */
  renderItem: (item: T, index: number, width: number) => ReactElement;
  /** The exact artwork URL a tile will draw at `width`, so the rows the focus is
   *  heading for are fetched and decoded before they mount. */
  art?: (item: T, width: number) => string | null;
  /** Scrolls with the first row; needs `headerHeight` set alongside it. */
  header?: ReactElement;
  headerHeight?: number;
  /** The viewport that clips. Defaults to filling its parent; give it a bounded
   *  height either way, or nothing scrolls. */
  style?: ViewStyle;
  onEndReached?: () => void;
  /** Opens the grid on this ROW (not item index) with focus, since the row is
   *  not mounted yet for `autoFocus` to reach. Read once, on mount. */
  initialIndex?: number;
  /** Called when the grid leaves or returns to its first row. */
  onScrolledChange?: (scrolled: boolean) => void;
}
