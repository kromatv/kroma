// <Divider>: a hairline rule. One physical pixel would vanish on a 4K panel
// viewed from three metres, so the 10-foot variant is deliberately heavier.

import { Box } from '#ui/components/atoms/box';
import type { ColorValue } from '#ui/core';

interface DividerProps {
  /** Run vertically instead of horizontally. */
  vertical?: boolean;
  /** In px. Defaults to 1 on the web scale. */
  thickness?: number;
  /** Space above and below (or left and right when vertical). */
  spacing?: number;
  color?: ColorValue;
}

function Divider({
  vertical = false,
  thickness = 1,
  spacing = 0,
  color = 'border',
}: Readonly<DividerProps>) {
  return vertical ? (
    <Box w={thickness} self="stretch" bg={color} mx={spacing} />
  ) : (
    <Box h={thickness} self="stretch" bg={color} my={spacing} />
  );
}

export type { DividerProps };
export { Divider };
