// The seam between two panels or two columns, and the reader's grip on it: drag
// it to widen the one behind it, press it to take it with the remote, press it
// twice or hold it to put them back where they started.
//
// The gesture is a PanResponder rather than pointer events, because the same
// handle has to work on Apple TV, where there is no DOM to listen to.

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { PanResponder, type PanResponderGestureState } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { styles, sv } from '#ui/core';
import { space } from '#ui/core/tokens';
import type { GroupOrientation } from '#ui/lib/group-shape';
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

const COLUMN_GRAB = space[3];

// The two insets that pin a face along the seam's own length; the free axis is
// left to the container's centring, so one shape serves both orientations.
const span = (upright: boolean) =>
  upright ? ({ top: 0, bottom: 0 } as const) : ({ left: 0, right: 0 } as const);

// react-native-web paints a real cursor; React Native's own `CursorValue` knows
// `auto` and `pointer` and nothing else, so the two resize cursors are stated
// as plain style rather than through the shorthand vocabulary.
const CURSOR = styles({
  horizontal: { cursor: 'col-resize' },
  vertical: { cursor: 'row-resize' },
});

function grabBox(column: boolean, upright: boolean) {
  if (column) return { absolute: true, top: 0, bottom: 0, right: 0, w: COLUMN_GRAB } as const;
  return upright ? { w: HANDLE_THICKNESS } : { h: HANDLE_THICKNESS };
}

function along(orientation: GroupOrientation, gesture: PanResponderGestureState): number {
  return orientation === 'horizontal' ? gesture.dx : gesture.dy;
}

type SeamVariant = 'panel' | 'column';

interface SeamProps {
  variant: SeamVariant;
  orientation: GroupOrientation;
  label: string | undefined;
  disabled: boolean;
  share: number;
  onBegin: () => void;
  onDrag: (delta: number, committed: boolean) => void;
  onReset: () => void;
}

function Seam({
  variant,
  orientation,
  label,
  disabled,
  share,
  onBegin,
  onDrag,
  onReset,
}: Readonly<SeamProps>) {
  const [held, setHeld] = useState(false);

  useResizableKeys({
    held,
    orientation,
    onNudge: (towards) => {
      onBegin();
      onDrag(towards * STEP, true);
    },
    onRelease: () => setHeld(false),
  });

  const restore = useCallback(() => {
    setHeld(false);
    onReset();
  }, [onReset]);

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

  const fromAt = useRef(0);
  const isDrag = useEffectEvent(
    (gesture: PanResponderGestureState) => Math.abs(along(orientation, gesture)) > DRAG_SLOP,
  );
  const startDrag = useEffectEvent((gesture: PanResponderGestureState) => {
    fromAt.current = along(orientation, gesture);
    draggedAt.current = Date.now();
    onBegin();
    releaseCursor.current = holdCursor(orientation);
  });
  const moveDrag = useEffectEvent((gesture: PanResponderGestureState) => {
    draggedAt.current = Date.now();
    onDrag(along(orientation, gesture) - fromAt.current, false);
  });
  const endDrag = useEffectEvent((gesture: PanResponderGestureState) => {
    draggedAt.current = Date.now();
    releaseCursor.current();
    releaseCursor.current = NOOP;
    onDrag(along(orientation, gesture) - fromAt.current, true);
  });
  // Built once: the callbacks are effect events, so the one responder always
  // sees the current seam and orientation without ever being recreated.
  const [pan] = useState(() =>
    PanResponder.create({
      // A press is the child's, until it turns into a drag.
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_event, gesture) => isDrag(gesture),
      onPanResponderGrant: (_event, gesture) => startDrag(gesture),
      onPanResponderMove: (_event, gesture) => moveDrag(gesture),
      // Once the seam is moving, nothing underneath takes the gesture back.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_event, gesture) => endDrag(gesture),
      onPanResponderTerminate: (_event, gesture) => endDrag(gesture),
    }),
  );

  const upright = orientation === 'horizontal';
  const column = variant === 'column';
  const handlers = disabled ? null : pan.panHandlers;
  const cursor = disabled ? undefined : CURSOR[orientation];
  return (
    <Box {...handlers} shrink={0} z={2} {...grabBox(column, upright)} style={cursor}>
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
        disabled={disabled}
        ring={false}
        focusScale={1}
        sv={seam}
        vars={{ held, variant }}
        style={cursor}
        onPress={press}
        onLongPress={restore}
        onBlur={() => setHeld(false)}
      >
        {({ slots }) =>
          column ? (
            <Box absolute top={space[2]} bottom={space[2]} right={0} w={RULE} style={slots.rule} />
          ) : (
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
          )
        }
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
    variant: {
      panel: {},
      column: { rule: { bg: 'border' } },
    },
    held: {
      true: {
        seam: { bg: 'accentSoft', _hover: { bg: 'accentSoft' }, _focus: { bg: 'accentSoft' } },
        rule: { bg: 'accent', _hover: { bg: 'accent' }, _focus: { bg: 'accent' } },
        grip: { bg: 'accent', _hover: { bg: 'accent' }, _focus: { bg: 'accent' } },
      },
    },
  },
  defaults: { variant: 'panel', held: false },
});

const NOOP = () => {};

export type { SeamProps };
export { HANDLE_THICKNESS, Seam };
