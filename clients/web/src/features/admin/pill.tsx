// The small toned pill an admin row wears: a kind, a status, a role. Not the
// kit's <Badge>, whose tones are the palette's own semantic steps; these carry a
// hue the page already holds (a pipeline stage, a report category).

import { type ColorValue, color, Row, Text, type TypeRole } from '@kroma/ui/kit';
import type { CSSProperties, ReactNode } from 'react';

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

// A React Native view cannot carry a CSS animation, so a dot that breathes is a
// real element rather than a <Box>.
const DOT: CSSProperties = { borderRadius: '50%', flex: '0 0 auto' };
const BREATHE = 'kroma-breathe 2s ease-in-out infinite';

interface PillDotProps {
  tone: ColorValue;
  size?: number;
  /** Breathes, for a state that is still moving. */
  pulse?: boolean;
}

/** The dot a status pill leads with. */
export function PillDot({ tone, size = 6, pulse }: Readonly<PillDotProps>) {
  return (
    <span
      style={{
        ...DOT,
        width: size,
        height: size,
        background: color(tone),
        animation: pulse ? BREATHE : undefined,
      }}
    />
  );
}
