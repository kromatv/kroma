// The palette, as a sheet.

import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { readMode, resolveMode } from '#ui/core';
import { colors, lightColors } from '#ui/core/tokens/colors';

export default story({
  name: 'Colors',
  group: 'Foundations',
  docs: 'Every color token in the design system. The source is packages/ui/src/core/tokens/colors.ts, which also generates the CSS variables for the browser targets.',
  matrix: false,
  width: { min: 480, max: 1000 },
  render: () => {
    const palette = resolveMode(readMode()) === 'light' ? lightColors : colors;
    return (
      <Box row wrap gap={16}>
        {(Object.keys(colors) as (keyof typeof colors)[]).map((token) => (
          <Box key={token} gap={8} w={150}>
            <Box h={56} radius="md" bg={token} border="border" />
            <Text variant="meta" color="textMuted">
              {token}
            </Text>
            <Text variant="meta" color="textDim" font="mono">
              {palette[token]}
            </Text>
          </Box>
        ))}
      </Box>
    );
  },
});
