import { type StyleScope, resolveStyles, sharedStyle, styles, useStyleScope } from '#ui/core';
// What a <ButtonGroup> publishes to each of its children, and the style a member
// builds from it.
//
// React Native has no `:first-child`, no sibling combinator and no `:has()`, so
// the position a web member would have read off the DOM is handed to it
// explicitly, one context provider per child. It lives in lib/ rather than
// beside <ButtonGroup> because the members are atoms, and an atom may not
// import a molecule.

import { createContext, useCallback, useContext, useState } from 'react';
import type { ViewStyle } from 'react-native';

import type { Radius } from '#ui/core/tokens/layout';
import type { ControlSize } from '#ui/lib/field-shell';

type GroupOrientation = 'horizontal' | 'vertical';

type GroupPosition = 'only' | 'first' | 'middle' | 'last';

interface GroupSlot {
  orientation: GroupOrientation;
  position: GroupPosition;
  radius: Radius;
  size: ControlSize;
}

interface GroupMember {
  grouped: boolean;
  style: ViewStyle | null;
  size: ControlSize | null;
  onFocus: () => void;
  onBlur: () => void;
}

const GroupSlotContext = createContext<GroupSlot | null>(null);

const slots = new Map<string, GroupSlot>();

/** The same slot object for the same values, so a group hands a child a context
 *  value whose identity survives the group's own re-render. */
function groupSlot(
  orientation: GroupOrientation,
  position: GroupPosition,
  radius: Radius,
  size: ControlSize,
): GroupSlot {
  const key = `${orientation}:${position}:${radius}:${size}`;
  const hit = slots.get(key);
  if (hit) return hit;
  const made: GroupSlot = { orientation, position, radius, size };
  slots.set(key, made);
  return made;
}

// Keep joins in the build's sheet as well as the runtime sheet. Otherwise a
// static button radius loaded after the SSR sheet rounds these corners again.
const joins = styles({
  left: { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeftWidth: 0 },
  right: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  top: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0 },
  bottom: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
});

function corners(
  orientation: GroupOrientation,
  position: GroupPosition,
  radius: Radius,
  scope: StyleScope,
): ViewStyle {
  const joinsBefore = position === 'middle' || position === 'last';
  const joinsAfter = position === 'middle' || position === 'first';
  const s = resolveStyles(joins, scope);
  const vertical = orientation === 'vertical';
  const before = vertical ? s.top : s.left;
  const after = vertical ? s.bottom : s.right;
  return {
    borderTopLeftRadius: radius,
    borderTopRightRadius: radius,
    borderBottomLeftRadius: radius,
    borderBottomRightRadius: radius,
    ...(joinsBefore ? before : null),
    ...(joinsAfter ? after : null),
  };
}

// The ring is drawn OUTSIDE the box, and a group collapses the borders, so a
// focused member would otherwise be overpainted by the one after it. Only the
// member knows it is focused, which is why the group cannot lift it, and why the
// group must never clip: an `overflow` there would cut the ring.
const RAISED = { zIndex: 1 };

function shapeOf(slot: GroupSlot, focused: boolean, scope: StyleScope): ViewStyle {
  const { orientation, position, radius } = slot;
  return sharedStyle(
    `group-shape:${orientation}:${position}:${radius}:${focused}`,
    {
      ...corners(orientation, position, radius, scope),
      ...(focused ? RAISED : null),
    },
    scope,
  ) as ViewStyle;
}

/** What the surrounding <ButtonGroup> published for this child, or null outside
 *  one. For a part that needs more than the shape: a separator's axis, a size to
 *  fall back on. */
function useGroupSlot(): GroupSlot | null {
  return useContext(GroupSlotContext);
}

/**
 * The style a member of a <ButtonGroup> applies to its own root: the corners its
 * position keeps, and the leading border zeroed so it shares one line with the
 * member before it rather than stacking a second against it.
 *
 * Null outside a group, so a control that does not read this hook simply keeps
 * its own shape. Pass `focused` to lift the member over its neighbours for as
 * long as it wears the ring.
 */
function useGroupShape(focused = false): ViewStyle | null {
  const scope = useStyleScope();

  const slot = useContext(GroupSlotContext);
  return slot ? shapeOf(slot, focused, scope) : null;
}

/**
 * `useGroupShape` for a control that takes focus: the same style, the size the
 * group falls back to, and focus handlers that lift the control while it is
 * focused. The handlers compose the caller's own; outside a group they touch no
 * state, so an ungrouped control still does not re-render when focus arrives.
 */
function useGroupMember(onFocus?: () => void, onBlur?: () => void): GroupMember {
  const scope = useStyleScope();

  const slot = useContext(GroupSlotContext);
  const [raised, setRaised] = useState(false);
  const grouped = slot !== null;
  const enter = useCallback(() => {
    if (grouped) setRaised(true);
    onFocus?.();
  }, [grouped, onFocus]);
  const leave = useCallback(() => {
    if (grouped) setRaised(false);
    onBlur?.();
  }, [grouped, onBlur]);
  return {
    grouped,
    style: slot ? shapeOf(slot, raised, scope) : null,
    size: slot?.size ?? null,
    onFocus: enter,
    onBlur: leave,
  };
}

export type { GroupMember, GroupOrientation, GroupPosition, GroupSlot };
export { GroupSlotContext, groupSlot, useGroupMember, useGroupShape, useGroupSlot };
