import type { ReactNode } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Img } from '#ui/components/atoms/img';

import { Text } from '#ui/components/atoms/text';

import { tintGradient } from '#ui/components/molecules/media-card';

import { stillArt } from '#ui/lib/sample-art';

import { Frost } from './frost';

export const TINT = tintGradient(['#3A2E4F', '#1B1524']);

export const CORNER = 20;

export // A photograph behind the panel, never a flat fill: a blur over one colour is
// that colour again, and the layer would look like nothing at all.
function OverArt({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box h={240} radius="lg" overflow="hidden" center px={24}>
      <Img src={stillArt(2)} background={TINT} fill />
      {children}
    </Box>
  );
}

export function Panel({ amount, radius }: Readonly<{ amount?: number; radius?: number }>) {
  return (
    <Box px={22} py={16} gap={4} radius={CORNER} bg="surface1/55" border="border">
      {amount === undefined ? null : <Frost amount={amount} radius={radius ?? CORNER} />}
      <Text variant="label">Volume levelling</Text>
      <Text variant="meta" color="textMuted">
        Evens out the loud scenes.
      </Text>
    </Box>
  );
}
