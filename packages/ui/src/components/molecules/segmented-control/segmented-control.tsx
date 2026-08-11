// <SegmentedControl>: one selected option among a few. A radiogroup to
// assistive tech: each segment is a radio carrying `checked`, and on a physical
// keyboard the arrow keys move the selection the way a native radio group does.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { useTheme } from '#ui/core';
import { CONTROL, type ControlSize, entryDefaultSize } from '#ui/lib/field-shell';
import { FocusRegion } from '#ui/lib/focus-scope';
import {
  type Box2D,
  Context,
  GROUP_PAD,
  type SegmentedContext,
  type SegmentedOption,
  segmentRadius,
} from './segmented-control-context';
import { Item } from './segmented-control-segment';

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
  /** Draw each segment as its glyph alone. For options that are universally
   *  understood as icons and whose words would be noise. */
  iconOnly?: boolean;
  /** Sugar for the plain case, instead of writing an Item per option. */
  options?: readonly SegmentedOption<T>[];
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

function Root<T extends string>({
  value,
  onValueChange,
  label,
  size,
  stretch = false,
  iconOnly = false,
  options,
  children,
  style,
}: Readonly<RootProps<T>>) {
  const shell = size ?? entryDefaultSize();
  const metrics = CONTROL[shell];
  // Registration order, not measured geometry: geometry arrives a frame later
  // and the arrows have to work on the first render.
  const order = useRef<string[]>([]);
  const off = useRef(new Set<string>());
  const boxes = useRef(new Map<string, Box2D>());
  const [thumb, setThumb] = useState<Box2D | null>(null);

  const report = useCallback(
    (option: string, box: Box2D) => {
      boxes.current.set(option, box);
      if (option === value) setThumb(box);
    },
    [value],
  );

  const select = useCallback((next: string) => onValueChange(next as T), [onValueChange]);

  const register = useCallback((option: string) => {
    if (!order.current.includes(option)) order.current.push(option);
  }, []);

  const mark = useCallback((option: string, disabled: boolean) => {
    if (disabled) off.current.add(option);
    else off.current.delete(option);
  }, []);

  const forget = useCallback((option: string) => {
    const at = order.current.indexOf(option);
    if (at !== -1) order.current.splice(at, 1);
    off.current.delete(option);
    boxes.current.delete(option);
  }, []);

  useEffect(() => {
    const at = boxes.current.get(value);
    if (at) setThumb(at);
  }, [value]);

  const move = (delta: -1 | 1) => {
    const row = order.current;
    const at = row.indexOf(value);
    if (at === -1) return;
    for (let step = 1; step <= row.length; step += 1) {
      const key = row[(((at + delta * step) % row.length) + row.length) % row.length];
      if (key === undefined || key === value) return;
      if (off.current.has(key)) continue;
      onValueChange(key as T);
      return;
    }
  };

  const ctx = useMemo<SegmentedContext>(
    () => ({
      value,
      select,
      size: shell,
      stretch,
      iconOnly,
      report,
      register,
      mark,
      forget,
    }),
    [value, select, shell, stretch, iconOnly, report, register, mark, forget],
  );

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
          {options?.map((option) => (
            <Item key={option.value} {...option} />
          ))}
          {children}
        </Box>
      </FocusRegion>
    </Context.Provider>
  );
}

// One layer behind every segment, which is why a segment paints no fill.
function Thumb({ at, radius }: Readonly<{ at: Box2D | null; radius: number }>) {
  const theme = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
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

const SegmentedControl = { Root, Item };

export type { RootProps as SegmentedRootProps };
export { SegmentedControl };
