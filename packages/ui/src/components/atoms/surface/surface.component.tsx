import { useSv } from '#ui/core/recipe';
import { useStyleScope } from '#ui/core/style-context';
import { useBreakpointStep } from '#ui/core/use-breakpoint.hook';
// <Surface>: a raised panel.
//
// Screens kept spelling out `bg="surface1" radius="lg" border="border" p={20}`,
// which is three token lookups and a magic number every time a card is needed.
// Naming the combinations makes the elevation ladder a design decision the kit
// owns rather than something each screen re-derives.

import type { ReactNode } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Frost } from '#ui/components/atoms/frost';
import { type BoxStyleProps, splitShorthand, sv, type Variant } from '#ui/core';
import type { CornerValue } from '#ui/core/tokens/layout';
import { sharedBoxStyle } from '#ui/lib/box-style';
import { MEMBER_INSET } from '#ui/lib/ring-scope';
import { RingScope } from '#ui/lib/ring-scope.component';

const SURFACE_RADIUS = 'xl';

const surfaceVariants = sv({
  base: { radius: SURFACE_RADIUS },
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
      true: { border: 'borderStrong' },
    },
  },
  defaults: { tone: 'plain', pad: 'md', elevated: false },
});

type SurfaceTone = Variant<typeof surfaceVariants, 'tone'>;
type SurfacePad = Variant<typeof surfaceVariants, 'pad'>;

interface SurfaceProps extends Omit<BoxProps, 'bg' | 'children'> {
  tone?: SurfaceTone;
  /** Ignored with `members`, which pads the card itself. */
  pad?: SurfacePad;
  /** Set it off the page with the stronger edge. Nothing in the kit floats. */
  elevated?: boolean;
  /** A card of controls flush with one another, a list of rows: it clips them,
   *  keeps them `MEMBER_INSET` off its edge, hands a member that states no
   *  corner its own less that inset, and draws their focus rings inside. */
  members?: boolean;
  children?: ReactNode;
}

function Surface({
  tone = 'plain',
  pad = 'md',
  elevated = false,
  members = false,
  style,
  children,
  ...box
}: Readonly<SurfaceProps>) {
  const recipe = useSv(surfaceVariants);
  const { root } = recipe({ tone, pad: members ? 'none' : pad, elevated });
  const { rest, asked } = useAskedStyle(box);
  const panel = (
    <Box {...rest} style={[root, members ? MEMBERS : null, asked, style]}>
      <Members on={members} radius={box.radius}>
        {children}
      </Members>
    </Box>
  );
  return <Frost on={tone === 'glass'}>{panel}</Frost>;
}

// Resolved here so the layers land in the order a reader expects: recipe,
// then the caller's shorthands, then the one-off `style`.
function useAskedStyle(box: Readonly<Omit<BoxProps, 'bg' | 'children' | 'style'>>) {
  const scope = useStyleScope();
  const split = splitShorthand(box);
  const step = useBreakpointStep(split.breakpoints);
  const key = split.breakpoints === 0 ? split.key : `${step}|${split.key}`;
  const asked = split.key ? sharedBoxStyle(key, split.shorthand as BoxStyleProps, scope) : null;
  return { rest: split.rest, asked };
}

function Members({
  on,
  radius,
  children,
}: Readonly<{ on: boolean; radius: SurfaceProps['radius']; children?: ReactNode }>) {
  if (!on) {
    return children;
  }
  return (
    <RingScope placement="inside" corner={cornerOf(radius)}>
      {children}
    </RingScope>
  );
}

function cornerOf(radius: SurfaceProps['radius']): CornerValue {
  return typeof radius === 'string' || typeof radius === 'number' ? radius : SURFACE_RADIUS;
}

const MEMBERS = { padding: MEMBER_INSET, overflow: 'hidden' } as const;

export type { SurfacePad, SurfaceProps, SurfaceTone };
export { Surface, surfaceVariants };
