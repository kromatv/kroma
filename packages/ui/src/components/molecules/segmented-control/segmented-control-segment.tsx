// One segment: a radio in the group's row, and the shell it is drawn in.

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { type StyleDecl, svFor } from '#ui/core';
import { bySize, CONTROL } from '#ui/lib/field-shell';
import {
  GROUP_PAD,
  type SegmentedOption,
  segmentRadius,
  useSegmented,
} from './segmented-control-context';

// A segment is a control in the same family as an entry: the shell's own
// padding and type, with the corner stepped in so the pill's inner radius
// nests inside the group's (see lib/field-shell).
const segmentedControlVariants = svFor<{ root: StyleDecl; label: StyleDecl; desc: StyleDecl }>()({
  slots: {
    root: { row: true, center: true, gap: 7, _hover: { bg: 'tint/8' }, _press: { bg: 'tint/14' } },
    label: { font: 'ui', fontWeight: '600', color: 'text/75' },
    desc: { font: 'ui', fontSize: 11, color: 'textDim' },
  },
  variants: {
    size: bySize((m) => ({
      root: { px: m.px, py: m.py - GROUP_PAD, minH: m.line },
      label: { fontSize: m.fontSize, lineHeight: m.line },
    })),
    active: {
      true: {
        root: { _hover: { bg: 'transparent' }, _press: { bg: 'transparent' } },
        label: { color: 'accentText' },
      },
    },
  },
  defaults: { size: 'md', active: false },
});

interface ItemProps<T extends string> extends SegmentedOption<T> {
  /** Anything richer than a string: a count as a `<Badge>`, a swatch. `label`
   *  stays the accessible name, so what is heard does not depend on what is
   *  drawn. */
  children?: ReactNode;
}

function Item<T extends string>({
  value,
  label,
  icon,
  desc,
  disabled,
  children,
}: Readonly<ItemProps<T>>) {
  const ctx = useSegmented('Item');
  const { value: picked, select, size, stretch, iconOnly, report, register, mark, forget } = ctx;
  const active = value === picked;
  const glyph = Math.round(CONTROL[size].fontSize * 1.2);
  const corner = { borderRadius: segmentRadius(size) };
  // Two effects: folding `disabled` in would re-register the segment at the end of the row.
  useEffect(() => {
    register(value);
    return () => forget(value);
  }, [register, forget, value]);
  useEffect(() => {
    mark(value, Boolean(disabled));
  }, [mark, value, disabled]);
  // The wrapper is what the thumb measures: <Focusable> owns its own onLayout.
  return (
    <Box
      onLayout={(event: LayoutChangeEvent) => {
        // Copied, never kept: React Native pools the layout event, so a stored
        // reference is one object shared by every segment.
        const { x, width } = event.nativeEvent.layout;
        report(value, { x, width });
      }}
      style={stretch ? SEGMENT_GROW : undefined}
    >
      <Focusable
        role="radio"
        checked={active}
        label={label}
        disabled={disabled}
        onPress={() => select(value)}
        sv={segmentedControlVariants}
        vars={{ size, active }}
        style={stretch ? [SEGMENT_FILL, corner] : corner}
      >
        {(state) => (
          <>
            {icon ? (
              <Icon name={icon} size={glyph} color={active ? 'accentText' : 'text/75'} />
            ) : null}
            {(() => {
              if (iconOnly && icon) return null;
              return children ?? <Text style={state.slots.label}>{label}</Text>;
            })()}
            {desc ? <Text style={state.slots.desc}>{desc}</Text> : null}
          </>
        )}
      </Focusable>
    </Box>
  );
}

// An equal share of the row, with the label centred in it. Frozen rather than
// built per render: it never varies.
const SEGMENT_GROW = { flex: 1, alignItems: 'center' } as const;

const SEGMENT_FILL = { alignSelf: 'stretch', alignItems: 'center' } as const;

export { Item, segmentedControlVariants };
