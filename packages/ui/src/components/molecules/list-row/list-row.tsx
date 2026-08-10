// <ListRow>: one focusable row of a menu or a settings list.
//
// This shape was written three times before it moved here: the TV profile menu,
// the signed-out device settings, and the admin lists. It is a molecule rather
// than a primitive because it composes four of them (Focusable, Icon, Txt and
// whatever sits at the end) into the one arrangement the design specifies:
// a round glyph well, the label taking the slack, and a trailing affordance.
//
// The well itself is <IconWell>, because the TV's server list needed the same
// mark on a row this component cannot draw (a badge beside the title, two
// sub-lines) and was drawing its own, four points larger.

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Frost } from '#ui/components/atoms/frost';
import { Icon, type IconName, type IconProps } from '#ui/components/atoms/icon';
import { IconWell } from '#ui/components/atoms/icon-well';
import { Txt } from '#ui/components/atoms/text';
import { radius, type StyleDecl, svFor } from '#ui/core';
import { CONTROL } from '#ui/lib/field-shell';
import { ListGroup, useInListGroup } from './list-group';

type ListRowSize = 'sm' | 'tv';

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
    size: {
      sm: {
        root: { gap: 12, px: 14, py: 11 },
        label: { fontSize: 15 },
        hint: { fontSize: 13 },
        chevron: { size: 17 },
      },
      tv: {
        root: { gap: 16, px: 20, py: 16 },
        label: { fontSize: 18 },
        hint: { fontSize: 15 },
        chevron: { size: 20 },
      },
    },
    /** Its own object, or one member of a <ListRow.Group>'s single card. A
     *  member draws no surface: the group carries the well, the blur, the
     *  edge and the lift for the whole list. */
    standalone: {
      true: {
        root: {
          radius: 'xl',
          border: 'border',
          // THE SAME WELL A FIELD SITS IN, taken from the one table
          // (lib/field-shell) so a row and an input can never drift apart.
          // Translucent, so <Frost> blurs what shows through and the lift
          // keeps the row off the artwork behind it.
          bg: CONTROL.md.bg,
          shadow: 'card',
        },
      },
      // A member is flush with the card that clips it, so its ring is drawn
      // INWARD - the same width, ink and gap, on the only side there is.
      false: { root: { _focus: { bg: 'accentSoft', ring: 'focusInset' } } },
    },
    /** Whether the row leads anywhere. The step before the amber edge, and only
     *  a row that does something on press takes it: a settings list is full of
     *  rows that only display. */
    pressable: {
      true: { root: { _hover: { bg: 'surface3' } } },
    },
  },
  defaults: { size: 'tv', pressable: false, standalone: true },
});

interface ListRowProps extends Omit<FocusableProps, 'children' | 'style' | 'label'> {
  /** Leading glyph. Omit it and the row starts at the label. */
  icon?: IconName;
  /** Something other than a glyph in the leading slot - an <Avatar>, say, on a
   *  row that is about a PERSON. Wins over `icon`. */
  leading?: ReactNode;
  label: string;
  /** A second line under the label, for the rows that need explaining. */
  hint?: string;
  size?: ListRowSize;
  /** Trailing content: a value, a Switch, a Badge. Defaults to a chevron when
   *  the row leads somewhere, and to nothing when it does not. */
  trailing?: ReactNode;
  /** The row's middle column, written by the caller instead of derived from
   *  `label`/`hint`. `label` is still required: it stays the accessible name
   *  however the row is arranged. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

function ListRow({
  icon,
  leading,
  label,
  hint,
  size = 'tv',
  trailing,
  children,
  onPress,
  style,
  ...focusProps
}: Readonly<ListRowProps>) {
  // A member of a <ListRow.Group> sits in the group's card, so it draws no
  // surface of its own.
  const standalone = !useInListGroup();
  return (
    <Focusable
      {...focusProps}
      onPress={onPress}
      label={label}
      focusScale={1.02}
      sv={listRowVariants}
      vars={{ size, pressable: onPress !== undefined, standalone }}
      style={style}
    >
      {(state) => (
        <>
          {/* Blur what shows through the translucent fill: the row reads as
              one glass surface rather than a window on the artwork. A member
              of a group is inside the card that already did this. */}
          {standalone ? <Frost radius={radius.xl} /> : null}
          {leading ?? (icon ? <IconWell name={icon} size={size} /> : null)}
          {/* minW 0: without it a long label pushes the trailing slot off the
              row instead of ellipsing, which is the one thing a row of a
              settings list must never do. */}
          <Box flex minW={0} gap={2}>
            {children ?? (
              <>
                <Txt style={state.slots.label}>{label}</Txt>
                {hint ? (
                  <Txt color="textDim" style={state.slots.hint}>
                    {hint}
                  </Txt>
                ) : null}
              </>
            )}
          </Box>
          {trailing ?? (onPress ? <Icon name="chevron-right" {...state.slots.chevron} /> : null)}
        </>
      )}
    </Focusable>
  );
}

// Radix's shape: the row is the common case and stays one line, and the
// grouped list is reached by name (see components/README.md).
const ListRowNamespace = Object.assign(ListRow, { Group: ListGroup });

export type { ListRowProps, ListRowSize };
export { ListRowNamespace as ListRow, listRowVariants };
