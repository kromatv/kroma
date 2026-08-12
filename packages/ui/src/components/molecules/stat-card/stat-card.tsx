// <StatCard>: one number that matters, on a card - the dashboard's sessions
// count, a module's disk usage. Label above, display-size value, optional unit.
//
// The same pair as <DataField>, raised onto a <Surface>: same part names, so a
// readout reads the same whether it is on a card or loose in a column.

import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Surface, type SurfaceProps } from '#ui/components/atoms/surface';
import { Text } from '#ui/components/atoms/text';
import type { ColorToken } from '#ui/core';

type StatInk = ColorToken | (string & {});

interface StatCardRootProps extends Omit<SurfaceProps, 'children'> {
  /** The card: a `<StatCard.Label>`, and the `<StatCard.Value>` under it. */
  children?: ReactNode;
}

function Root({ children, ...surface }: Readonly<StatCardRootProps>) {
  return (
    <Surface gap={GAP} {...surface}>
      {children}
    </Surface>
  );
}

/** What the number is called. */
function Label({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Text variant="overline" color="textDim">
      {children}
    </Text>
  );
}

interface StatCardValueProps {
  /** A quiet tail on the number's baseline: a percentage, a budget, "To". */
  unit?: string;
  /** Ink for the number. Defaults to the text colour; a rate that has a hue
   *  (CPU red, success green) states it here. */
  color?: StatInk;
  children: ReactNode;
}

/** The number itself, at display size. */
function Value({ unit, color = 'text', children }: Readonly<StatCardValueProps>) {
  return (
    <Box row align="baseline" gap={8}>
      <Text variant="heading" color={color}>
        {children}
      </Text>
      {unit ? (
        <Text variant="meta" color="textDim">
          {unit}
        </Text>
      ) : null}
    </Box>
  );
}

const GAP = 10;

/**
 * One number that matters, on a card.
 *
 * ```tsx
 * <StatCard.Root>
 *   <StatCard.Label>Sessions</StatCard.Label>
 *   <StatCard.Value>4</StatCard.Value>
 * </StatCard.Root>
 *
 * <StatCard.Root>
 *   <StatCard.Label>Stockage</StatCard.Label>
 *   <StatCard.Value unit="To" color="accent">1,2</StatCard.Value>
 *   <Progress value={0.62} />
 * </StatCard.Root>
 * ```
 */
const StatCard = { Root, Label, Value };

export type { StatCardRootProps, StatCardValueProps };
export { StatCard };
