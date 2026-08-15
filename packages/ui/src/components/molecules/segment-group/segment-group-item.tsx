// One segment: a radio in the group's row, and the shell it is drawn in.

import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { type StyleDecl, svFor } from '#ui/core';
import { bySize, CONTROL } from '#ui/lib/field-shell';
import { nameOf } from '#ui/lib/name-of';
import { partContext } from '#ui/lib/part-context';
import { GROUP_PAD, segmentRadius, useSegmentGroup } from './segment-group-context';

// A segment is a control in the same family as an entry: the shell's own
// padding and type, with the corner stepped in so the pill's inner radius
// nests inside the group's (see lib/field-shell).
const segmentGroupVariants = svFor<{ root: StyleDecl; label: StyleDecl; hint: StyleDecl }>()({
  slots: {
    root: { row: true, center: true, gap: 7, _hover: { bg: 'tint/8' }, _press: { bg: 'tint/14' } },
    label: { font: 'ui', fontWeight: '600', color: 'text/75' },
    hint: { font: 'ui', fontSize: 11, color: 'textDim' },
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

const [ItemContext, useSegmentItem] =
  partContext<ReturnType<typeof segmentGroupVariants>>('SegmentGroup.Item');

interface ItemProps {
  value: string;
  /** Names the segment to assistive tech. It draws NOTHING: the drawn title is
   *  <SegmentGroup.Label>, whose plain text already names the segment. Reach
   *  for it only where the children carry no text a reader could use: a
   *  glyph-only segment, or a count spoken in another form than it is drawn. */
  label?: string;
  /** Leading glyph. A segment with no <SegmentGroup.Label> is the glyph alone,
   *  and `label` carries its name. */
  icon?: IconName;
  disabled?: boolean;
  children?: ReactNode;
}

function Item({ value, label, icon, disabled, children }: Readonly<ItemProps>) {
  const { value: picked, select, size, stretch, report } = useSegmentGroup('Item');
  const active = value === picked;
  const glyph = Math.round(CONTROL[size].fontSize * 1.2);
  const corner = { borderRadius: segmentRadius(size) };
  const slots = segmentGroupVariants({ size, active });
  return (
    <ItemContext.Provider value={slots}>
      <Focusable
        role="radio"
        checked={active}
        label={label ?? nameOf(children)}
        disabled={disabled}
        onPress={() => select(value)}
        onLayout={(event: LayoutChangeEvent) => {
          // Copied, never kept: React Native pools the layout event, so a stored
          // reference is one object shared by every segment.
          const { x, width } = event.nativeEvent.layout;
          report(value, { x, width });
        }}
        sv={segmentGroupVariants}
        vars={{ size, active }}
        style={stretch ? [SEGMENT_GROW, corner] : corner}
      >
        {icon ? <Icon name={icon} size={glyph} color={active ? 'accentText' : 'text/75'} /> : null}
        {children}
      </Focusable>
    </ItemContext.Provider>
  );
}

/** The segment's drawn title; its plain text is the segment's accessible name. */
function Label({ children }: Readonly<{ children: ReactNode }>) {
  const slots = useSegmentItem('Label');
  return <Text style={slots.label}>{children}</Text>;
}

/** The quieter word beside the label: the fact that settles the choice. */
function Hint({ children }: Readonly<{ children: ReactNode }>) {
  const slots = useSegmentItem('Hint');
  return <Text style={slots.hint}>{children}</Text>;
}

// An equal share of the row, with the label centred in it. Frozen rather than
// built per render: it never varies.
const SEGMENT_GROW = { flex: 1, alignItems: 'center' } as const;

export { Hint, Item, Label, segmentGroupVariants };
