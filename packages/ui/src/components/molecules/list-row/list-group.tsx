// <ListRow.Group>: rows sharing ONE card, hairlines between them, instead of
// a column of separate ones.
//
// The two shapes are not interchangeable: a standalone row is its own object
// (its own edge, its own lift, its own corners) and reads as a destination; a
// group reads as one list of related settings, which is why a phone's server
// picker and a settings screen want it. The group owns the surface, so its
// members drop theirs: see the `standalone` variant in ./list-row.

import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  type ReactNode,
  useContext,
} from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Frost } from '#ui/components/atoms/frost';
import { CONTROL } from '#ui/lib/field-shell';

const InGroup = createContext(false);

/** Whether this row is a member of a {@link ListGroup}, and so must not draw
 * a surface of its own. */
export function useInListGroup(): boolean {
  return useContext(InGroup);
}

interface ListGroupProps {
  children: ReactNode;
  /** Insets the hairlines from the card's edge, so they read as separators
   *  between rows rather than as full-width rules. */
  divider?: number;
  style?: StyleProp<ViewStyle>;
}

function ListGroup({ children, divider = 20, style }: Readonly<ListGroupProps>) {
  const items = Children.toArray(children);
  return (
    <Box
      w="100%"
      radius="xl"
      border="border"
      // The card carries the shell's well, its blur and its lift ONCE, for
      // every row in it (lib/field-shell).
      bg={CONTROL.md.bg}
      shadow="card"
      // The members' corners are the card's: clip them rather than asking
      // each row which end of the list it landed on.
      overflow="hidden"
      style={style}
    >
      <Frost radius="xl" />
      <InGroup.Provider value={true}>
        {items.map((child, index) => (
          <Fragment key={memberKey(child, index)}>
            {index > 0 ? <Box h={1} mx={divider} bg="border" /> : null}
            {child}
          </Fragment>
        ))}
      </InGroup.Provider>
    </Box>
  );
}

// A child's own key where it has one, so reordering the list does not remount
// every row; its index otherwise.
function memberKey(child: ReactNode, index: number): string {
  return isValidElement(child) && child.key != null ? String(child.key) : `row-${index}`;
}

export type { ListGroupProps };
export { ListGroup };
