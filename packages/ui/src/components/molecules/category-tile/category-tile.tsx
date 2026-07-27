import type { StyleProp, ViewStyle } from 'react-native';
// <CategoryTile>: a labelled artwork tile with a coloured wash over it.
//
// The genre grid wrote this first - a library backdrop under a bottom-heavy
// wash of the genre's own hue, with the label sitting in the darkest part - and
// it is the right shape for anything that groups titles rather than being one:
// a genre, a collection, a channel, a studio. So it moves here, and the screen
// keeps only the part that IS about genres (which hue, which backdrop).
//
// The two gradients do different jobs and both are needed. `background` is the
// instant fill <Img> paints before (or instead of) the artwork. `wash` is the
// veil ON TOP of the artwork, which is what makes white text readable over a
// photograph nobody chose for its contrast. Each is a CSS gradient string, the
// same currency <Img> and `gradient()` already trade in.

import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Img } from '#ui/components/atoms/img';
import { Txt } from '#ui/components/atoms/text';
import { gradient } from '#ui/lib/css';
import { sv } from '#ui/lib/sv';
import { fonts, radius as radii } from '#ui/lib/tokens';

const categoryTileVariants = sv({
  slots: {
    frame: { flexShrink: 0, padding: 6, borderRadius: radii.xl },
    label: { fontFamily: fonts.display, fontWeight: '700', color: '#FFFFFF' },
    meta: {
      fontFamily: fonts.ui,
      fontWeight: '600',
      color: 'rgba(255, 255, 255, 0.72)',
      fontVariant: ['tabular-nums'],
    },
  },
  variants: {
    size: {
      md: { label: { fontSize: 18, lineHeight: 20 }, meta: { fontSize: 12 } },
      /** The 10-foot size, as the genre grid uses it. */
      tv: { label: { fontSize: 23, lineHeight: 24 }, meta: { fontSize: 14 } },
    },
  },
  defaults: { size: 'tv' },
});

type CategoryTileSize = 'md' | 'tv';

interface CategoryTileProps extends Omit<FocusableProps, 'children' | 'style' | 'label'> {
  /** The category's name. Also the accessibility name. */
  label: string;
  /** A second line under it: a count, a year range. */
  meta?: string;
  /** Artwork URL, already sized. Null falls back to `background` alone. */
  art?: string | null;
  /** CSS gradient painted behind the art: visible instantly, and the whole tile
   *  when there is no artwork. Build it with `tintGradient()`. */
  background?: string;
  /** CSS gradient laid OVER the art, so the label stays readable on any photo. */
  wash?: string;
  /** The small dash above the label, in the category's own colour. Omit for no
   *  dash. */
  accent?: string;
  size?: CategoryTileSize;
  /** Tile width. The height follows from `aspect`. */
  width?: number;
  /** Artwork ratio. 16:9 by default, as the genre grid uses it. */
  aspect?: number;
  /** Anything extra pinned into the bottom block, under the meta line. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

function CategoryTile({
  label,
  meta,
  art = null,
  background,
  wash,
  accent,
  size = 'tv',
  width = 340,
  aspect = 16 / 9,
  children,
  style,
  focusScale = 1.04,
  ...focusProps
}: Readonly<CategoryTileProps>) {
  const s = categoryTileVariants({ size });
  return (
    <Focusable
      {...focusProps}
      label={label}
      focusScale={focusScale}
      // The frame's own padding is what keeps the amber focus ring clear of the
      // artwork instead of cutting across it.
      style={[s.frame, { width }, style]}
    >
      <Box aspect={aspect} radius="lg" overflow="hidden" bg="surface1" shadow="card">
        <Img src={art} background={background} position="50% 25%" fill />
        {wash ? <Box fill pointerEvents="none" style={gradient(wash)} /> : null}
        <Box absolute left={20} right={20} bottom={16} gap={2}>
          {accent ? <Box h={4} w={28} radius="pill" bg={accent} mb={8} /> : null}
          <Txt style={s.label}>{label}</Txt>
          {meta ? <Txt style={s.meta}>{meta}</Txt> : null}
          {children}
        </Box>
      </Box>
    </Focusable>
  );
}

export type { CategoryTileProps, CategoryTileSize };
export { CategoryTile, categoryTileVariants };
