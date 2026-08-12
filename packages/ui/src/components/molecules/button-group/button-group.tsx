// <ButtonGroup>: a row (or a column) of related controls rendered as ONE
// control. Adjacent members share a single border line and their inner corners
// are flattened, so three buttons read as one segmented object: a split button,
// a toolbar cluster, a value with its unit welded to the end.
//
// The web builds this out of `:first-child` / `:last-child` and a collapsed
// border. React Native has none of those selectors, so the group counts its
// children and publishes each one's position through a context (see
// lib/group-shape); the members shape themselves from it. A context rather than
// `cloneElement` because a member is routinely wrapped - a <Tooltip> trigger, a
// <Menu> trigger - and cloned props would land on the wrapper, not the control.

import { Children, isValidElement, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { type CornerValue, radiusValue, styles } from '#ui/core';
import { HAND } from '#ui/lib/cursor';
import { bySize, CONTROL, type ControlSize, entryDefaultSize } from '#ui/lib/field-shell';
import {
  type GroupOrientation,
  type GroupPosition,
  GroupSlotContext,
  groupSlot,
  useGroupShape,
  useGroupSlot,
} from '#ui/lib/group-shape';

// What separates two clusters once a group holds groups. Wide enough to read as
// a break in the row, narrow enough that the clusters still read as one bar.
const CLUSTER_GAP = 8;

interface ButtonGroupRootProps {
  orientation?: GroupOrientation;
  /** Names the group to assistive tech: what these controls are controls of. */
  label: string;
  /** The group's outer corner, by token name or in px. Defaults to the one
   *  that goes with `size`. */
  radius?: CornerValue;
  /** The size members fall back to, defaulting to the shell's. A member's own
   *  `size` still wins. */
  size?: ControlSize;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

function Root({
  orientation = 'horizontal',
  label,
  radius,
  size,
  style,
  children,
}: Readonly<ButtonGroupRootProps>) {
  // The slot a surrounding group handed this one supplies the size and the
  // corner, and nothing else: a nested group SWALLOWS the position it was given
  // and hands its own children fresh ones, which is what keeps a cluster's own
  // ends rounded.
  const outer = useGroupSlot();
  const shell = size ?? outer?.size ?? entryDefaultSize();
  const corner = radiusValue(radius ?? outer?.radius ?? CONTROL[shell].radius);
  const items = Children.toArray(children);
  // A group inside a group is a cluster of its own: the outer group stops
  // collapsing borders and spaces the clusters instead, which is how a toolbar
  // of clusters is written.
  const clustered = items.some(isGroup);
  return (
    <Box
      row={orientation === 'horizontal'}
      self="flex-start"
      gap={clustered ? CLUSTER_GAP : 0}
      // `role` and a label, and deliberately not `accessible`: iOS would merge
      // the members into one element and destroy their individual labels.
      role="group"
      accessibilityLabel={label}
      style={[HAND, style]}
    >
      {items.map((child, index) => (
        <GroupSlotContext.Provider
          key={slotKey(child, index)}
          value={groupSlot(
            orientation,
            clustered ? 'only' : positionAt(index, items.length),
            corner,
            shell,
          )}
        >
          {child}
        </GroupSlotContext.Provider>
      ))}
    </Box>
  );
}

interface ButtonGroupAddonProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** A chip nothing can press, shaped like the members around it: a protocol, a
 *  domain suffix, the unit a neighbouring value is counted in. */
function Addon({ children, style }: Readonly<ButtonGroupAddonProps>) {
  const shape = useGroupShape();
  const size = useGroupSlot()?.size ?? entryDefaultSize();
  const metrics = CONTROL[size];
  return (
    <Box
      row
      center
      px={metrics.px}
      minH={metrics.height}
      bg="surface2"
      border="borderStrong"
      radius={metrics.radius}
      style={[shape, style]}
    >
      <Text color="textDim" style={chip[size]}>
        {children}
      </Text>
    </Box>
  );
}

/** A hairline between two members, for the variants that carry no border of
 *  their own. It occupies a child slot, so the member after it is still shaped
 *  as the member after it. */
function Separator() {
  const vertical = useGroupSlot()?.orientation === 'vertical';
  return <Box bg="borderStrong" style={vertical ? s.horizontalLine : s.verticalLine} />;
}

// One px, not a hairline: the separator has to read as the same line that two
// bordered members collapse into.
const s = styles({
  verticalLine: { w: 1, self: 'stretch' },
  horizontalLine: { h: 1, self: 'stretch' },
});

const chip = styles(bySize((m) => ({ fontSize: m.fontSize, fontWeight: '600' as const })));

function positionAt(index: number, count: number): GroupPosition {
  if (count === 1) return 'only';
  if (index === 0) return 'first';
  if (index === count - 1) return 'last';
  return 'middle';
}

function isGroup(child: ReactNode): boolean {
  return isValidElement(child) && child.type === Root;
}

function slotKey(child: ReactNode, index: number): string {
  return isValidElement(child) && child.key !== null ? String(child.key) : `slot-${index}`;
}

const ButtonGroup = { Root, Addon, Separator };

export type { ButtonGroupAddonProps, ButtonGroupRootProps };
export { ButtonGroup };
