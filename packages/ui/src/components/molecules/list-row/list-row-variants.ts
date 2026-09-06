import type { IconProps } from '#ui/components/atoms/icon';
import { type StyleDecl, svFor } from '#ui/core';
import { bySize, type ControlSize } from '#ui/lib/field-shell';

type ListRowSize = ControlSize;

/** What a <ListRow.Root> is drawn on. See its `ground` variant. */
type RowGround = 'artwork' | 'surface';

const listRowVariants = svFor<{
  root: StyleDecl;
  label: StyleDecl;
  hint: StyleDecl;
  chevron: Pick<IconProps, 'color' | 'size'>;
}>()({
  slots: {
    root: { w: '100%', row: true, align: 'center' },
    label: { fontWeight: '700' },
    hint: {},
    chevron: { color: 'textDim' },
  },
  variants: {
    // The well, the corner, the padding and the height a control of this size
    // wears, so a row and the field beside it are one family (lib/field-shell).
    size: bySize((m) => ({
      root: { gap: m.gap, px: m.px, py: m.py, radius: m.radius, minH: m.height, bg: m.bg },
      label: { fontSize: m.fontSize, lineHeight: m.line },
      hint: { fontSize: Math.round(m.fontSize * 0.86) },
      chevron: { size: Math.round(m.fontSize * 1.2) },
    })),
    /** What is behind the row. Over `artwork` the translucent well is blurred
     *  and lifted, which is what makes it read as an object on a picture; on a
     *  `surface` - a dialog's card, a settings panel - there is nothing to
     *  stand off, and a blur and a drop shadow on every row of a list that
     *  recycles are paid per frame for nothing. Only the shape changes: the
     *  well, the corner and the outward ring are the same row either way. */
    ground: {
      artwork: {},
      surface: {},
    },
    /** Its own object, or one member of a <ListRow.Group>'s single card. A
     *  member draws no surface: the group carries the well, the blur, the
     *  edge and the lift for the whole list. */
    standalone: {
      true: { root: { border: 'border' } },
      // A member is flush with the card that clips it, so its ring is drawn
      // INWARD - the same width, ink and gap, on the only side there is.
      false: {
        root: { radius: 0, bg: 'transparent', _focus: { bg: 'accentSoft', ring: 'focusInset' } },
      },
    },
    /** Whether the row leads anywhere. The step before the amber edge, and only
     *  a row that does something on press takes it: a settings list is full of
     *  rows that only display. */
    pressable: {
      true: { root: { _hover: { bg: 'surface3' } } },
    },
    /** The row the list is currently ABOUT: the run being read, the server in
     *  use. A wash, not the focus ring, because a selected row keeps its
     *  reading while the focus is somewhere else entirely. */
    selected: {
      true: { root: { bg: 'accentSoft' }, label: { color: 'accentText' } },
    },
  },
  defaults: { size: 'md', pressable: false, standalone: true, ground: 'artwork', selected: false },
});

export type { ListRowSize, RowGround };
export { listRowVariants };
