// <Divider>: a hairline rule. One physical pixel would vanish on a 4K panel
// viewed from three metres, so the 10-foot variant is deliberately heavier.

import { Box } from '#ui/components/atoms/box';
import { colors } from '#ui/lib/tokens';

interface DividerProps {
  /** Run vertically instead of horizontally. */
  vertical?: boolean;
  /** Thickness. Defaults to 1 on the web scale. */
  size?: number;
  /** Space above and below (or left and right when vertical). */
  spacing?: number;
  color?: string;
}

function Divider({
  vertical = false,
  size = 1,
  spacing = 0,
  color = colors.border,
}: Readonly<DividerProps>) {
  return vertical ? (
    <Box w={size} self="stretch" bg={color} mx={spacing} />
  ) : (
    <Box h={size} self="stretch" bg={color} my={spacing} />
  );
}

export type { DividerProps };
export { Divider };
