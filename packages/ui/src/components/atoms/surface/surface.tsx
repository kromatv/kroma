// <Surface>: a raised panel.
//
// Screens kept spelling out `bg="surface1" radius="lg" border="border" p={20}`,
// which is three token lookups and a magic number every time a card is needed.
// Naming the combinations makes the elevation ladder a design decision the kit
// owns rather than something each screen re-derives.

import type { ReactNode } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Frost } from '#ui/components/atoms/frost';
import { type BoxStyleProps, boxStyle, splitShorthand, sv, useTheme, type Variant } from '#ui/core';

const surfaceVariants = sv({
  base: { radius: 'lg' },
  variants: {
    tone: {
      /** The default card: one step up from the page. */
      plain: { bg: 'surface1' },
      /** Two steps up, for a panel sitting ON a card. */
      raised: { bg: 'surface2' },
      /** No fill, just an edge. For grouping without adding weight. */
      outline: { bg: 'transparent', border: 'border' },
      /** Over artwork, where a solid fill would hide the image. */
      glass: { bg: 'tint/6', border: 'borderStrong' },
    },
    pad: {
      none: {},
      sm: { p: 12 },
      md: { p: 20 },
      lg: { p: 28 },
    },
    elevated: {
      // `shadow.card` is a CSS box-shadow string; React Native 0.76+ takes it
      // through the `boxShadow` style, which is what the `shadow` shorthand sets.
      true: { shadow: 'card' },
    },
  },
  defaults: { tone: 'plain', pad: 'md', elevated: false },
});

type SurfaceTone = Variant<typeof surfaceVariants, 'tone'>;
type SurfacePad = Variant<typeof surfaceVariants, 'pad'>;

interface SurfaceProps extends Omit<BoxProps, 'bg' | 'children'> {
  tone?: SurfaceTone;
  pad?: SurfacePad;
  /** Lift it off the page with the design's card shadow. */
  elevated?: boolean;
  children?: ReactNode;
}

function Surface({
  tone = 'plain',
  pad = 'md',
  elevated = false,
  style,
  children,
  ...box
}: Readonly<SurfaceProps>) {
  const defaultRadius = useTheme().radius.lg;
  const { root } = surfaceVariants({ tone, pad, elevated });
  // Resolved here so the layers land in the order a reader expects: recipe,
  // then the caller's shorthands, then the one-off `style`.
  const { shorthand, rest, any } = splitShorthand(box);
  const asked = any ? boxStyle(shorthand as BoxStyleProps) : null;
  // Glass frosts what sits behind it (see <Frost>); the other tones are
  // opaque, where a backdrop blur has nothing to do. The radius is read off the
  // resolved layers rather than flattened out of the whole style prop: the
  // caller's own `style` cannot move a backdrop it does not know about.
  const frostRadius = asked?.borderRadius ?? root.borderRadius;
  return (
    <Box {...rest} style={[root, asked, style]}>
      {tone === 'glass' ? (
        <Frost radius={typeof frostRadius === 'number' ? frostRadius : defaultRadius} />
      ) : null}
      {children}
    </Box>
  );
}

export type { SurfacePad, SurfaceProps, SurfaceTone };
export { Surface, surfaceVariants };
