// <StatCard>: one number that matters, on a card - the dashboard's sessions
// count, a module's disk usage. Label above, display-size value, optional unit.

import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Surface, type SurfaceProps } from '#ui/components/atoms/surface';
import { Txt } from '#ui/components/atoms/text';
import type { ColorToken } from '#ui/core';

interface StatCardProps extends Omit<SurfaceProps, 'children'> {
  label: string;
  value: ReactNode;
  unit?: string;
  /** Ink for the value. Defaults to the text colour; a rate that has a hue
   *  (CPU red, success green) states it here. */
  color?: ColorToken | (string & {});
}

function StatCard({ label, value, unit, color = 'text', ...surface }: Readonly<StatCardProps>) {
  return (
    <Surface {...surface}>
      <Txt variant="overline" color="textDim">
        {label}
      </Txt>
      <Box row align="baseline" gap={8} mt={10}>
        <Txt variant="h2" color={color} style={VALUE}>
          {value}
        </Txt>
        {unit ? (
          <Txt variant="meta" color="textDim">
            {unit}
          </Txt>
        ) : null}
      </Box>
    </Surface>
  );
}

// The design's stat size sits between h2 and h1; Txt re-derives line height
// and tracking from the role when a size is overridden.
const VALUE = { fontSize: 30 } as const;

export type { StatCardProps };
export { StatCard };
