// <AddTile>: the "one more" slot at the end of a row of tiles: add a profile,
// add a server. A dashed square with a plus, and a LABEL under it, because the
// two together are one control: one focus stop, one hit area, one thing a
// screen reader announces.
//
// It is a real glass tile rather than a ghost outline. These rows sit over the
// sign-in artwork, and a bare dashed border disappears against a bright frame,
// so the well carries the same translucent fill and blur every other control
// wears (see lib/field-shell, <Frost>), and the dashes read against it instead
// of against whatever the splash happens to be showing.

import type { StyleProp, ViewStyle } from 'react-native';
import { AVATAR_ROUNDNESS } from '#ui/components/atoms/avatar';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Frost } from '#ui/components/atoms/frost';
import { Icon, type IconProps } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { type StyleDecl, svFor } from '#ui/core';
import { CONTROL } from '#ui/lib/field-shell';

type AddTileSize = 'md' | 'tv';

// The well is exactly an <Avatar>'s box, because that is what it sits beside:
// same side, and the same corner RATIO, so the dashed square and the profile
// pictures either side of it round identically at either scale.
const WELL = { md: 104, tv: 146 } as const;

function corner(size: AddTileSize): number {
  return Math.round(WELL[size] * AVATAR_ROUNDNESS);
}

const addTileVariants = svFor<{
  root: StyleDecl;
  well: StyleDecl;
  glyph: Pick<IconProps, 'color' | 'size' | 'thickness'>;
  label: StyleDecl;
}>()({
  slots: {
    // The whole column is the control: one focus stop, and a hit area that
    // includes the caption rather than only the square above it.
    root: { align: 'center' },
    well: {
      center: true,
      borderStyle: 'dashed',
      borderWidth: 2,
      border: 'tint/35',
      // The same glass every other control wears (lib/field-shell): the
      // translucent well, the hairline lift, and a <Frost> under it. Over
      // artwork the dashes need something behind them to read against, and
      // borrowing the control fill is what keeps this tile in the same family
      // as the field and the keys rather than inventing a third surface.
      bg: CONTROL.md.bg,
      shadow: 'card',
      _hover: { borderColor: 'accent' },
      _focus: { borderColor: 'accent' },
    },
    // A SOLID ink, never an alpha: the plus is two crossing strokes, and a
    // translucent colour double-paints where they overlap into a brighter knot
    // at the centre.
    glyph: { color: '#BDBCC4', _hover: { color: 'accentText' }, _focus: { color: 'accentText' } },
    label: { color: 'text/80', fontWeight: '500' },
  },
  variants: {
    size: {
      md: {
        root: { gap: 6 },
        well: { w: WELL.md, h: WELL.md, radius: corner('md') },
        glyph: { size: 34 },
        label: { fontSize: 15 },
      },
      tv: {
        root: { gap: 12 },
        well: { w: WELL.tv, h: WELL.tv, radius: corner('tv') },
        glyph: { size: 46 },
        label: { fontSize: 18 },
      },
    },
  },
  defaults: { size: 'tv' },
});

interface AddTileProps extends Omit<FocusableProps, 'children' | 'style'> {
  /** Names the control, and is drawn under the tile. Both, from one string:
   *  the caption IS the accessible name, so they cannot drift apart. */
  label: string;
  size?: AddTileSize;
  /** The glyph, for a row that adds something other than a profile. */
  icon?: 'plus' | 'server' | 'device-tv';
  style?: StyleProp<ViewStyle>;
}

/**
 * The trailing "add" tile of a profile or server row.
 *
 * ```tsx
 * <AddTile label={t('profiles.addProfile')} onPress={() => nav.go('addProfile')} />
 * ```
 */
function AddTile({ label, size = 'tv', icon = 'plus', style, ...focus }: Readonly<AddTileProps>) {
  // <Frost> clips itself to the corner rather than inheriting it: it is a
  // sibling layer, not a child of the border.
  const radius = corner(size);
  return (
    <Focusable
      {...focus}
      label={label}
      // The whole column is the control, so the ring would box the label too;
      // the well takes an amber edge instead, which is also what the row's
      // other tiles do.
      ring={false}
      focusScale={size === 'tv' ? 1.07 : 1.04}
      sv={addTileVariants}
      vars={{ size }}
      style={style}
    >
      {({ slots }) => (
        <>
          <Box style={slots.well}>
            {/* The fill is translucent, so blur what shows through: the tile
                reads as glass over the artwork rather than a hole in it. */}
            <Frost radius={radius} />
            <Icon name={icon} thickness={1.6} {...slots.glyph} />
          </Box>
          <Text style={slots.label}>{label}</Text>
        </>
      )}
    </Focusable>
  );
}

export type { AddTileProps, AddTileSize };
export { AddTile, addTileVariants };
