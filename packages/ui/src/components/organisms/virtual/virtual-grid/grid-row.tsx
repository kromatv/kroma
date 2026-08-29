import { NavigatorNode, type NodeHandle } from '@kroma/spatial-nav/react';
import { memo, type ReactElement, useCallback } from 'react';
import { View, type ViewStyle } from 'react-native';

interface GridRowProps<T> {
  data: readonly T[];
  /** Where in the data this row's first tile is. */
  first: number;
  columns: number;
  /** This row's slot in the navigator, counting a header as row 0. The row's
   *  place in the DATA, never in the mounted window: the navigator orders
   *  siblings by the slot they declare, so a window-relative one would renumber
   *  every row each time the window slid. */
  row: number;
  top: number;
  style: ViewStyle;
  renderCell: (item: T, index: number) => ReactElement;
  onNode: (row: number, node: NodeHandle | null) => void;
}

function GridRowImpl<T>({
  data,
  first,
  columns,
  row,
  top,
  style,
  renderCell,
  onNode,
}: Readonly<GridRowProps<T>>) {
  const attach = useCallback((node: NodeHandle | null) => onNode(row, node), [onNode, row]);

  const cells: ReactElement[] = [];
  for (let column = 0; column < columns; column += 1) {
    const index = first + column;
    const item = data[index];
    if (item === undefined) break;
    cells.push(
      // The column a vertical press keeps, DECLARED rather than counted among
      // the tiles that happen to be here: the last row of a library is short,
      // and a column read off its own tiles would drift on the way into it.
      <NavigatorNode key={column} index={column}>
        {/* Back to a vertical box: the row itself lays out sideways. */}
        <View>{renderCell(item, index)}</View>
      </NavigatorNode>,
    );
  }

  return (
    <NavigatorNode ref={attach} index={row} orientation="horizontal">
      <View style={[style, { top }]}>{cells}</View>
    </NavigatorNode>
  );
}

/** One row of a `<VirtualGrid>`, positioned at its own offset down the strip.
 *  Memoised on purpose: the grid re-renders on every focus move, and a row
 *  whose tiles have not changed must not rebuild them. */
const GridRow = memo(GridRowImpl) as typeof GridRowImpl;

export type { GridRowProps };
export { GridRow };
