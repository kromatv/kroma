// <SegmentGroup>: one selected option among a few. A radiogroup to assistive
// tech: each segment is a radio carrying `checked`, and on a physical keyboard
// the arrow keys move the selection the way a native radio group does.

import { Children, isValidElement, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { useTheme } from '#ui/core';
import { CONTROL, type ControlSize, entryDefaultSize } from '#ui/lib/field-shell';
import { FocusRegion } from '#ui/lib/focus-scope';
import {
  type Box2D,
  Context,
  GROUP_PAD,
  type SegmentGroupContext,
  segmentRadius,
} from './segment-group-context';
import { Hint, Item, Label } from './segment-group-item';

interface RootProps<T extends string> {
  value: T;
  onValueChange: (next: T) => void;
  /** Accessible name of the group: what the segments are segments OF. */
  label?: string;
  /** The control shell's size; see <TextField>. */
  size?: ControlSize;
  /** Fill the width, every segment an equal share, instead of hugging its
   *  labels. For a control that names the MODE of the screen under it rather
   *  than a value in a form: a pill floating mid-page reads as unanchored, and
   *  a full-width bar reads as the thing the page is currently showing. */
  stretch?: boolean;
  /** The group's segments. Only a DIRECT <SegmentGroup.Item> child joins the
   *  arrow-key order, so an Item is never wrapped. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

function Root<T extends string>({
  value,
  onValueChange,
  label,
  size,
  stretch = false,
  children,
  style,
}: Readonly<RootProps<T>>) {
  const shell = size ?? entryDefaultSize();
  const metrics = CONTROL[shell];
  // JSX order, not measured geometry: geometry arrives a frame later and the
  // arrows have to work on the first render. Read off the direct children the
  // way a container declares to its parts, never through an effect a segment
  // has to run - an effect's cleanup re-fires on every re-render and would
  // forget what was measured.
  const order: string[] = [];
  const off = new Set<string>();
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child) || child.type !== Item) continue;
    const item = child.props as { value: string; disabled?: boolean };
    order.push(item.value);
    if (item.disabled) off.add(item.value);
  }
  const boxes = useRef(new Map<string, Box2D>());
  const [thumb, setThumb] = useState<Box2D | null>(null);

  const report = useEffectEvent((option: string, box: Box2D) => {
    boxes.current.set(option, box);
    if (option === value) setThumb(box);
  });

  const select = (next: string) => onValueChange(next as T);

  useEffect(() => {
    const at = boxes.current.get(value);
    if (at) setThumb(at);
  }, [value]);

  const move = useEffectEvent((delta: -1 | 1) => {
    const at = order.indexOf(value);
    if (at === -1) return;
    for (let step = 1; step <= order.length; step += 1) {
      const key = order[(((at + delta * step) % order.length) + order.length) % order.length];
      if (key === undefined || key === value) return;
      if (off.has(key)) continue;
      onValueChange(key as T);
      return;
    }
  });

  // Left to the React Compiler, which memoises this on the inputs it actually
  // reads. A hand-written `useMemo` here cannot be spelled correctly: its deps
  // would have to name effect events, which biome requires be left OUT of a
  // dependency array - and the mismatch is what makes the compiler give up on
  // the whole component.
  const ctx: SegmentGroupContext = {
    value,
    select,
    size: shell,
    stretch,
    report,
  };

  return (
    <Context.Provider value={ctx}>
      <FocusRegion>
        <Box
          row
          self={stretch ? 'stretch' : 'flex-start'}
          gap={GROUP_PAD}
          p={GROUP_PAD}
          radius={metrics.radius}
          border="borderStrong"
          bg="surface2"
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
          // A physical keyboard moves the selection with the arrows, the way a
          // native radio group does; the D-pad already walks the FocusRegion.
          onKeyDown={(event) => {
            const key = event.nativeEvent.key;
            if (key === 'ArrowLeft' || key === 'ArrowUp') move(-1);
            else if (key === 'ArrowRight' || key === 'ArrowDown') move(1);
          }}
          style={style}
        >
          <Thumb at={thumb} radius={segmentRadius(shell)} />
          {children}
        </Box>
      </FocusRegion>
    </Context.Provider>
  );
}

// One layer behind every segment, which is why a segment paints no fill.
function Thumb({ at, radius }: Readonly<{ at: Box2D | null; radius: number }>) {
  const theme = useTheme();
  const [x] = useState(() => new Animated.Value(0));
  const [width] = useState(() => new Animated.Value(0));
  const placed = useRef(false);
  useEffect(() => {
    if (!at) return;
    if (!placed.current) {
      placed.current = true;
      x.setValue(at.x);
      width.setValue(at.width);
      return;
    }
    const settle = { duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false };
    Animated.parallel([
      Animated.timing(x, { toValue: at.x, ...settle }),
      Animated.timing(width, { toValue: at.width, ...settle }),
    ]).start();
  }, [at, x, width]);
  if (!at) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        THUMB,
        {
          backgroundColor: theme.colors.accentSoft,
          borderRadius: radius,
          transform: [{ translateX: x }],
          width,
        },
      ]}
    />
  );
}

const THUMB = { position: 'absolute', top: GROUP_PAD, bottom: GROUP_PAD, left: 0 } as const;

const SegmentGroup = { Root, Item, Label, Hint };

export type { RootProps as SegmentGroupRootProps };
export { SegmentGroup };
