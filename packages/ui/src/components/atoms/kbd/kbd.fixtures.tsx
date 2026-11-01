import type { ReactNode } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

export function Chord({ children, label }: Readonly<{ children: ReactNode; label: string }>) {
  return (
    <Box row align="center" gap={3}>
      {children}
      <Text variant="meta" color="textDim" ml={3}>
        {label}
      </Text>
    </Box>
  );
}
