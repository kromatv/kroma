// The small toned pill an admin row wears: a kind, a status, a role. Not the
// kit's <Badge>, whose tones are the palette's own semantic steps; these carry a
// hue the page already holds (a pipeline stage, a report category).

import {
  Box,
  type ColorValue,
  color,
  Row,
  sharedStyle,
  styles,
  Text,
  type TypeRole,
} from '@kroma/ui/kit';
import type { ReactNode } from 'react';

const PAD: Partial<Record<TypeRole, { px: number; py: number }>> = {
  overline: { px: 8, py: 3 },
};

const DEFAULT_PAD = { px: 11, py: 5 };

interface PillProps {
  ink: ColorValue;
  bg: ColorValue;
  /** The type role the label takes, which also picks the pill's rhythm.
   *  Defaults to `meta`; `overline` is the tight uppercase eyebrow. */
  variant?: TypeRole;
  /** A dot or a ring at the head of the pill. */
  leading?: ReactNode;
  children: ReactNode;
}

export function Pill({ ink, bg, variant = 'meta', leading, children }: Readonly<PillProps>) {
  const pad = PAD[variant] ?? DEFAULT_PAD;
  return (
    <Row self="flex-start" shrink={0} gap={6} radius="pill" bg={bg} px={pad.px} py={pad.py}>
      {leading}
      <Text variant={variant} color={ink}>
        {children}
      </Text>
    </Row>
  );
}

const s = styles({
  dot: { radius: 'circle', flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  breathe: {
    animationKeyframes: 'kroma-breathe',
    animationDuration: '2s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
});

const dotOf = (size: number, tone: ColorValue) =>
  sharedStyle(`pill:dot:${size}:${tone}`, {
    width: size,
    height: size,
    backgroundColor: color(tone),
  });

interface PillDotProps {
  tone: ColorValue;
  size?: number;
  /** Breathes, for a state that is still moving. */
  pulse?: boolean;
}

/** The dot a status pill leads with. */
export function PillDot({ tone, size = 6, pulse }: Readonly<PillDotProps>) {
  return <Box style={[s.dot, dotOf(size, tone), pulse ? s.breathe : null]} />;
}
