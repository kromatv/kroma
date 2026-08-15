import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { useListRow } from './list-row-context';

/** The head of the row, for media rather than a glyph: an <Avatar>, a poster
 *  thumb, a module icon, a <StatusDot>, a <Spinner>. `<ListRow.Root icon>` is
 *  the sugar for the kit's icon well. */
function Leading({ children }: Readonly<{ children: ReactNode }>) {
  useListRow('Leading');
  // No box of its own: the row is already the row, and media never shrinks under
  // it - a view, an image and a glyph are all `flex-shrink: 0` to begin with.
  return children;
}

/** The row's title. Written first, its plain text is the row's accessible name. */
function Label({ children }: Readonly<{ children: ReactNode }>) {
  const { slots } = useListRow('Label');
  return (
    <Text lines={1} style={slots.label}>
      {children}
    </Text>
  );
}

/** The quieter second line: the fact that settles the row. */
function Hint({ children }: Readonly<{ children: ReactNode }>) {
  const { slots } = useListRow('Hint');
  return (
    <Text color="textDim" lines={2} style={slots.hint}>
      {children}
    </Text>
  );
}

interface TrailingProps {
  /** Lets the tail give up width so a long value truncates instead of pushing
   *  the row wider. Off by default: a face, a badge or a chevron has one size
   *  and must keep it. */
  shrink?: boolean;
  children: ReactNode;
}

/** The tail of the row: a value, a <Badge>, a <SwitchFace>. The row is the one
 *  focus stop, so an indicator here is a face and never a control. Given one,
 *  the row drops the chevron it otherwise draws when it leads somewhere. */
function Trailing({ shrink = false, children }: Readonly<TrailingProps>) {
  const { metrics } = useListRow('Trailing');
  return (
    <Box row align="center" shrink={shrink ? 1 : 0} minW={shrink ? 0 : undefined} gap={metrics.gap}>
      {children}
    </Box>
  );
}

export type { TrailingProps };
export { Hint, Label, Leading, Trailing };
