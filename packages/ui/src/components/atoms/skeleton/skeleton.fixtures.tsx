import type { ReactNode } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

export function Labelled({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Box gap={6}>
      <Text variant="overline" color="textDim">
        {label}
      </Text>
      {children}
    </Box>
  );
}
