import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { Divider } from './divider';

export default story({
  name: 'Divider',
  group: 'Layout',
  docs: 'A rule. A single physical pixel disappears on a 4K panel seen from a distance, hence an adjustable thickness rather than a fixed hairline.',
  matrix: false,
  // A rule spans whatever it is put in, so the story is given a range and the
  // divider is seen stretching rather than pinned to one width.
  width: { min: 240, max: 560 },
  args: { vertical: false, size: 1, spacing: 12 },
  controls: { size: { min: 1, max: 6, step: 1 }, spacing: { min: 0, max: 40, step: 4 } },
  render: (props) => (
    <Box row={props.vertical} align="center">
      <Txt variant="meta" color="textDim">
        before
      </Txt>
      <Divider {...props} />
      <Txt variant="meta" color="textDim">
        after
      </Txt>
    </Box>
  ),
});
