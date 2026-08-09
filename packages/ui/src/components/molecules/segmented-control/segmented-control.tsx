// <SegmentedControl>: one selected option among a few, each with an optional
// sub-label. A radiogroup to assistive tech: each segment is a radio carrying
// `checked`, and on a physical keyboard the arrow keys move the selection the
// way a native radio group does.

import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Txt } from '#ui/components/atoms/text';
import { type StyleDecl, svFor } from '#ui/core';
import { bySize, CONTROL, type ControlSize, entryDefaultSize } from '#ui/lib/field-shell';
import { FocusRegion } from '#ui/lib/focus-scope';

// The group's own padding, and therefore how much smaller a segment's corner
// is than the group's: concentric corners, not two radii guessed apart.
const GROUP_PAD = 4;

// A segment is a control in the same family as an entry: the shell's own
// padding and type, with the corner stepped in so the pill's inner radius
// nests inside the group's (see lib/field-shell).
const segmentedControlVariants = svFor<{ root: StyleDecl; label: StyleDecl; desc: StyleDecl }>()({
  slots: {
    root: { _hover: { bg: 'white/5' } },
    label: { font: 'ui', fontWeight: '600', color: 'text/75' },
    desc: { font: 'ui', fontSize: 11, color: 'textDim' },
  },
  variants: {
    size: bySize((m) => ({
      root: { px: m.px, py: m.py - GROUP_PAD, radius: m.radius - GROUP_PAD, minH: m.line },
      label: { fontSize: m.fontSize, lineHeight: m.line },
    })),
    active: {
      true: {
        root: { bg: 'accentSoft', _hover: { bg: 'accentSoft' } },
        label: { color: 'accent' },
      },
    },
  },
  defaults: { size: 'md', active: false },
});

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** A quieter second line under the label ("Recommandé", a codec note). */
  desc?: string;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  /** The control shell's size; see <TextField>. */
  size?: ControlSize;
  options: readonly SegmentedOption<T>[];
  onChange: (next: T) => void;
  /** Accessible name of the group. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

/** The next enabled option in `delta` direction, wrapping at the ends. */
function step<T extends string>(
  options: readonly SegmentedOption<T>[],
  value: T,
  delta: -1 | 1,
): T | null {
  const at = options.findIndex((option) => option.value === value);
  for (let hop = 1; hop <= options.length; hop++) {
    const next = options[(at + delta * hop + options.length * hop) % options.length];
    if (next && !next.disabled) return next.value === value ? null : next.value;
  }
  return null;
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  size,
  style,
}: Readonly<SegmentedControlProps<T>>) {
  const shell = size ?? entryDefaultSize();
  const metrics = CONTROL[shell];
  const move = (delta: -1 | 1) => {
    const next = step(options, value, delta);
    // `!== null`, not truthiness: '' is a legal option value ("Auto").
    if (next !== null) onChange(next);
  };
  return (
    <FocusRegion>
      <Box
        row
        self="flex-start"
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
        {options.map((option) => (
          <Segment
            key={option.value}
            option={option}
            size={shell}
            active={option.value === value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </Box>
    </FocusRegion>
  );
}

function Segment<T extends string>({
  option,
  size,
  active,
  onPress,
}: Readonly<{
  option: SegmentedOption<T>;
  size: ControlSize;
  active: boolean;
  onPress: () => void;
}>) {
  return (
    <Focusable
      role="radio"
      checked={active}
      label={option.label}
      disabled={option.disabled}
      onPress={onPress}
      sv={segmentedControlVariants}
      vars={{ size, active }}
    >
      {(state) => (
        <>
          <Txt style={state.slots.label}>{option.label}</Txt>
          {option.desc ? <Txt style={state.slots.desc}>{option.desc}</Txt> : null}
        </>
      )}
    </Focusable>
  );
}

export type { SegmentedControlProps, SegmentedOption };
export { SegmentedControl, segmentedControlVariants };
