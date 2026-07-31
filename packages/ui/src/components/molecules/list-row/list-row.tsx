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
import { Icon, type IconName, type IconProps } from '#ui/components/atoms/icon';
import { IconWell } from '#ui/components/atoms/icon-well';
import { Txt } from '#ui/components/atoms/text';
import { type StyleDecl, svFor } from '#ui/core';

type ListRowSize = 'sm' | 'tv';

const listRowVariants = svFor<{
  root: StyleDecl;
  label: StyleDecl;
  hint: StyleDecl;
  chevron: Pick<IconProps, 'color' | 'size'>;
}>()({
  slots: {
    root: {
      w: '100%',
      row: true,
      align: 'center',
      radius: 'xl',
      border: 'border',
      bg: 'white/3',
      // A solid amber edge rather than a fill, which is why the row draws no
      // ring: a row is wide, and a filled one at the top of a list reads as
      // "selected forever" instead of "focused".
      _focus: { border: 'accent' },
    },
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
    /** Whether the row leads anywhere. The step before the amber edge, and only
     *  a row that does something on press takes it: a settings list is full of
     *  rows that only display. */
    pressable: {
      true: { root: { _hover: { bg: 'white/7', border: 'borderStrong' } } },
    },
  },
  defaults: { size: 'tv', pressable: false },
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
  style?: StyleProp<ViewStyle>;
}

function ListRow({
  icon,
  leading,
  label,
  hint,
  size = 'tv',
  trailing,
  onPress,
  style,
  ...focusProps
}: Readonly<ListRowProps>) {
  return (
    <Focusable
      {...focusProps}
      onPress={onPress}
      label={label}
      focusScale={1.02}
      ring={false}
      sv={listRowVariants}
      vars={{ size, pressable: onPress !== undefined }}
      style={style}
    >
      {(state) => (
        <>
          {leading ?? (icon ? <IconWell name={icon} size={size} /> : null)}
          <Box flex gap={2}>
            <Txt style={state.slots.label}>{label}</Txt>
            {hint ? (
              <Txt color="textDim" style={state.slots.hint}>
                {hint}
              </Txt>
            ) : null}
          </Box>
          {trailing ?? (onPress ? <Icon name="chevron-right" {...state.slots.chevron} /> : null)}
        </>
      )}
    </Focusable>
  );
}

export type { ListRowProps, ListRowSize };
export { ListRow, listRowVariants };
