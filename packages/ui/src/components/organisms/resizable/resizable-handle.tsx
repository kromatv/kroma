// The seam between two panels, and the reader's grip on it: drag it to widen
// the panel behind it, press it to take it with the remote, press it twice or
// hold it to put the two panels either side back where they started.
//
// The gesture is a PanResponder rather than pointer events, because the same
// handle has to work on Apple TV, where there is no DOM to listen to.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, type PanResponderGestureState, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { sv } from '#ui/core';
import { space } from '#ui/core/tokens';
import type { GroupOrientation } from '#ui/lib/group-shape';
import { useResizableGroup, useSeamIndex } from './resizable-context';
import { holdCursor } from './resizable-cursor';
import { useResizableKeys } from './resizable-keys';

// Under this much movement the gesture is still a press. Deliberately tiny: a
// seam that wants a shove before it moves reads as stuck.
const DRAG_SLOP = 2;

// One arrow press, in points. Coarse enough to cross a panel in a few seconds
// of held D-pad, fine enough to land on a width.
const STEP = 24;

const DOUBLE_PRESS_MS = 350;

// A drag ends in a press: the browser sends a click wherever the gesture began,
// and a finger that stops moving is still a finger on the handle. Neither is
// someone asking for the arrow keys.
const AFTER_DRAG_MS = 300;

/**
 * The points a seam takes out of the group. Every handle is laid out whole
 * rather than hanging over its neighbours: an overhang is the obvious way to
 * widen a target, and it is wrong here, because the panes either side scroll,
 * macOS draws their scrollbars as an OVERLAY - zero layout width, painted on
 * top, right at the edge the seam sits on - and a scrollbar under the pointer
 * shows the arrow whatever the element beneath it asks for. The cursor then
 * flickers between the two as the pointer crosses. Taking the width honestly
 * costs the panels one gutter step and nothing else.
 */
const HANDLE_THICKNESS = space[4];

// The washed strip inside the grab box: what a mouse lights up on the web,
// where `hitSlop` does nothing. It leaves the smallest step either side of it
// and no more - a wider gutter reads as two panels floating apart rather than
// as one seam between them.
const SEAM = HANDLE_THICKNESS - space[1] * 2;

// A rule between two surfaces is a hairline; this one is a CONTROL, and at one
// point it disappears into the gutter around it.
const RULE = 2;

const GRIP = { long: space[6], short: space[1] };

// The two insets that pin a face along the seam's own length; the free axis is
// left to the container's centring, so one shape serves both orientations.
const span = (upright: boolean) =>
  upright ? ({ top: 0, bottom: 0 } as const) : ({ left: 0, right: 0 } as const);

// react-native-web paints a real cursor; React Native's own `CursorValue` knows
// `auto` and `pointer` and nothing else, so the two resize cursors are stated
// as plain style rather than through the shorthand vocabulary.
const CURSOR = {
  horizontal: { cursor: 'col-resize' },
  vertical: { cursor: 'row-resize' },
} as unknown as Record<GroupOrientation, ViewStyle>;

interface ResizableHandleProps {
  /** Names the seam to assistive tech. */
  label?: string;
  /** Fixes the two panels either side of it; the seam stays drawn and stops
   *  being a focus stop. Set on the group instead to fix every seam at once. */
  disabled?: boolean;
}

/**
 * The seam between two `<Resizable.Panel>`s. Write it between them: it takes
 * its place from where it sits, so nothing has to be indexed by hand.
 *
 * The whole strip is the control - one D-pad stop, a pointer-sized hit area -
 * and it answers three gestures: drag it, press it to take the arrow keys, and
 * press it twice (or hold it) to put its two panels back.
 */
function Handle({ label = 'Resize', disabled }: Readonly<ResizableHandleProps>) {
  const at = useSeamIndex();
  const group = useResizableGroup('Handle');
  const off = disabled === true || group.disabled;
  const { orientation, drag, reset } = group;
  const share = Math.round(group.layout[at] ?? 0);

  const [held, setHeld] = useState(false);
  const seat = useRef({ at, begin: group.begin, drag, reset });
  seat.current = { at, begin: group.begin, drag, reset };

  useResizableKeys({
    held,
    orientation,
    onNudge: (towards) => {
      seat.current.begin();
      seat.current.drag(seat.current.at, towards * STEP, true);
    },
    onRelease: () => setHeld(false),
  });

  const restore = useCallback(() => {
    setHeld(false);
    seat.current.reset(seat.current.at);
  }, []);

  const draggedAt = useRef(0);
  const pressedAt = useRef(0);
  const press = useCallback(() => {
    const now = Date.now();
    if (now - draggedAt.current < AFTER_DRAG_MS) return;
    if (now - pressedAt.current < DOUBLE_PRESS_MS) {
      pressedAt.current = 0;
      restore();
      return;
    }
    pressedAt.current = now;
    setHeld((was) => !was);
  }, [restore]);

  // A drag cut short by an unmount (a window crossing a breakpoint) would
  // otherwise leave the page wearing the resize cursor for the rest of the visit.
  const releaseCursor = useRef(NOOP);
  useEffect(() => () => releaseCursor.current(), []);

  const pan = useMemo(() => {
    const along = (gesture: PanResponderGestureState) =>
      orientation === 'horizontal' ? gesture.dx : gesture.dy;
    const from = { at: 0 };
    const end = (gesture: PanResponderGestureState) => {
      draggedAt.current = Date.now();
      releaseCursor.current();
      releaseCursor.current = NOOP;
      seat.current.drag(seat.current.at, along(gesture) - from.at, true);
    };
    return PanResponder.create({
      // A press is the child's, until it turns into a drag.
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(along(gesture)) > DRAG_SLOP,
      onPanResponderGrant: (_event, gesture) => {
        from.at = along(gesture);
        draggedAt.current = Date.now();
        seat.current.begin();
        releaseCursor.current = holdCursor(orientation);
      },
      onPanResponderMove: (_event, gesture) => {
        draggedAt.current = Date.now();
        seat.current.drag(seat.current.at, along(gesture) - from.at, false);
      },
      // Once the seam is moving, nothing underneath takes the gesture back.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_event, gesture) => end(gesture),
      onPanResponderTerminate: (_event, gesture) => end(gesture),
    });
  }, [orientation]);

  const upright = orientation === 'horizontal';
  const handlers = off ? null : pan.panHandlers;
  return (
    // The grab box takes `HANDLE_THICKNESS` of the group and paints `SEAM` down
    // the middle of it, so the target is wider than the line without borrowing
    // anyone's space.
    <Box
      {...handlers}
      shrink={0}
      z={2}
      w={upright ? HANDLE_THICKNESS : undefined}
      h={upright ? undefined : HANDLE_THICKNESS}
      style={off ? undefined : CURSOR[orientation]}
    >
      {/* The seam wears the cursor too: react-native-web gives a pressable
          `cursor: pointer`, so without this the middle of the strip reads as a
          button while the rest reads as a seam. */}
      {/* biome-ignore lint/a11y/useValidAriaRole: React Native's vocabulary, not ARIA's - react-native-web renders `adjustable` as the ARIA `slider`. */}
      <Focusable
        label={label}
        role="adjustable"
        // A slider with no value announces as one, so the seam reports the share
        // it has given the panel before it.
        value={{ min: 0, max: 100, now: share, text: `${share}%` }}
        disabled={off}
        ring={false}
        focusScale={1}
        sv={seam}
        vars={{ held }}
        style={off ? undefined : CURSOR[orientation]}
        onPress={press}
        onLongPress={restore}
        onBlur={() => setHeld(false)}
      >
        {({ slots }) => (
          // Both faces are stated as insets along the seam and a thickness
          // across it, so the two orientations are the same box turned ninety
          // degrees: a percentage of a parent that is only definite on one axis
          // is what left a horizontal seam's rule sitting on its top edge.
          <Box
            absolute
            {...span(upright)}
            w={upright ? SEAM : undefined}
            h={upright ? undefined : SEAM}
            align="center"
            justify="center"
            style={slots.seam}
          >
            {/* The rule runs the whole edge. Without it the only thing drawn at
                rest is the grip, a short bar floating in a tall column, which
                says nothing about where the seam is or how far it reaches - so
                the pointer lands beside the handle and gets the page's cursor. */}
            <Box
              absolute
              {...span(upright)}
              w={upright ? RULE : undefined}
              h={upright ? undefined : RULE}
              style={slots.rule}
            />
            <Box
              w={upright ? GRIP.short : GRIP.long}
              h={upright ? GRIP.long : GRIP.short}
              radius="pill"
              style={slots.grip}
            />
          </Box>
        )}
      </Focusable>
    </Box>
  );
}

// Only the seam itself is ever painted, never the grab box around it. Accent
// says ONE thing here - this seam is holding the arrow keys - so a pointer that
// merely passes over it, or leaves it focused, gets the quiet grey.
const seam = sv({
  slots: {
    root: { flex: true, align: 'center', justify: 'center' },
    seam: { bg: 'transparent', _hover: { bg: 'white/6' }, _focus: { bg: 'white/6' } },
    rule: { bg: 'borderStrong', _hover: { bg: 'textDim' }, _focus: { bg: 'textDim' } },
    grip: { bg: 'textDim', _hover: { bg: 'textMuted' }, _focus: { bg: 'textMuted' } },
  },
  variants: {
    held: {
      true: {
        seam: { bg: 'accentSoft', _hover: { bg: 'accentSoft' }, _focus: { bg: 'accentSoft' } },
        rule: { bg: 'accent', _hover: { bg: 'accent' }, _focus: { bg: 'accent' } },
        grip: { bg: 'accent', _hover: { bg: 'accent' }, _focus: { bg: 'accent' } },
      },
    },
  },
  defaults: { held: false },
});

const NOOP = () => {};

export type { ResizableHandleProps };
export { HANDLE_THICKNESS, Handle, STEP };
