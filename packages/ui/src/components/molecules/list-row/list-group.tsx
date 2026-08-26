// <ListRow.Group>: rows sharing ONE card, hairlines between them, instead of
// a column of separate ones.
//
// The two shapes are not interchangeable: a standalone row is its own object
// (its own edge, its own lift, its own corners) and reads as a destination; a
// group reads as one list of related settings, which is why a phone's server
// picker and a settings screen want it. The group owns the surface, so its
// members drop theirs: see the `standalone` variant in ./list-row-variants.
// The lift is the one thing it does NOT take from the standalone row.

import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Frost } from '#ui/components/atoms/frost';
import { CONTROL, type ControlSize, entryDefaultSize } from '#ui/lib/field-shell';
import { RingScopeProvider } from '#ui/lib/ring-scope';

interface ListGroupSlot {
  size: ControlSize;
}

const InGroup = createContext<ListGroupSlot | null>(null);

/** The group this row is a member of, or `null` when it stands alone. A member
 * must not draw a surface of its own, and takes the group's size. */
export function useListGroup(): ListGroupSlot | null {
  return useContext(InGroup);
}

interface ListGroupProps {
  children: ReactNode;
  /** The size members fall back to, defaulting to the app's
   *  (`setEntryDefaults`). A member's own `size` still wins. */
  size?: ControlSize;
  /** Insets the hairlines from the card's edge, so they read as separators
   *  between rows rather than as full-width rules. Defaults to the members'
   *  own side padding. */
  divider?: number;
  style?: StyleProp<ViewStyle>;
}

function ListGroup({ children, size, divider, style }: Readonly<ListGroupProps>) {
  const shell = size ?? entryDefaultSize();
  const metrics = CONTROL[shell];
  const items = Children.toArray(children);
  const slot = useMemo(() => ({ size: shell }), [shell]);
  return (
    <Frost>
      <Box
        w="100%"
        radius={metrics.radius}
        border="border"
        bg={metrics.bg}
        overflow="hidden"
        style={style}
      >
        {/* The card clips, so everything in it draws its ring inward - the rows,
            and equally the controls a caller puts beside a row, which have no
            way of knowing what surface they are on. */}
        <RingScopeProvider value="focusInset">
          <InGroup.Provider value={slot}>
            {items.map((child, index) => (
              <Fragment key={memberKey(child, index)}>
                {index > 0 ? <Box h={1} mx={divider ?? metrics.px} bg="border" /> : null}
                {child}
              </Fragment>
            ))}
          </InGroup.Provider>
        </RingScopeProvider>
      </Box>
    </Frost>
  );
}

// A child's own key where it has one, so reordering the list does not remount
// every row; its index otherwise.
function memberKey(child: ReactNode, index: number): string {
  return isValidElement(child) && child.key != null ? String(child.key) : `row-${index}`;
}

export type { ListGroupProps, ListGroupSlot };
export { ListGroup };
