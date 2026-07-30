// The palette, as a sheet.

import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { colors } from '#ui/lib/tokens';

export default story({
  name: 'Colors',
  group: 'Foundations',
  docs: 'Every color token in the design system. The source is packages/ui/src/lib/tokens/colors.ts, which also generates the CSS variables for the browser targets.',
  matrix: false,
  width: { min: 480, max: 1000 },
  render: () => (
    <Box row wrap gap={16}>
      {(Object.keys(colors) as (keyof typeof colors)[]).map((token) => (
        <Box key={token} gap={8} w={150}>
          <Box h={56} radius="md" bg={token} border="border" />
          <Txt variant="meta" color="textMuted">
            {token}
          </Txt>
          <Txt variant="meta" color="textDim">
            {colors[token]}
          </Txt>
        </Box>
      ))}
    </Box>
  ),
});
