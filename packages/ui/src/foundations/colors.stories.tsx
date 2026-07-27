// The palette, as a sheet.
//
// A token list belongs in the workbench for the same reason the components do:
// it is the thing a change lands on first, and reading a hex value in a file
// tells you nothing about whether the two surfaces are far enough apart.

import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { colors } from '#ui/lib/tokens';

export default story({
  name: 'Colors',
  group: 'Foundations',
  docs: 'Every color token in the design system. The source is packages/ui/src/lib/tokens/colors.ts, which also generates the CSS variables for the browser targets.',
  matrix: false,
  // The sheet wraps: how many swatches sit on a line is the canvas's answer.
  width: { min: 480, max: 1000 },
  render: () => (
    <Box row wrap gap={16}>
      {(Object.keys(colors) as (keyof typeof colors)[]).map((token) => (
        // The swatch keeps its own size on purpose: two surfaces are compared by
        // holding everything except the colour constant.
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
