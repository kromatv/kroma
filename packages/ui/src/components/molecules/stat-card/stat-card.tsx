// <StatCard>: one number that matters, on a card - the dashboard's sessions
// count, a module's disk usage. Label above, display-size value, optional unit.

import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Surface, type SurfaceProps } from '#ui/components/atoms/surface';
import { Text } from '#ui/components/atoms/text';
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
      <Text variant="overline" color="textDim">
        {label}
      </Text>
      <Box row align="baseline" gap={8} mt={10}>
        <Text variant="heading" color={color}>
          {value}
        </Text>
        {unit ? (
          <Text variant="meta" color="textDim">
            {unit}
          </Text>
        ) : null}
      </Box>
    </Surface>
  );
}

export type { StatCardProps };
export { StatCard };
