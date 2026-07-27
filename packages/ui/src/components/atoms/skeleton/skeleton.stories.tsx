import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Skeleton } from './skeleton';

export default story({
  name: 'Skeleton',
  group: 'State',
  docs: 'The pulsing placeholder for content that is loading. It takes the same layout shorthands as Box, so it sizes exactly like what it replaces.',
  matrix: false,
  args: { w: 220, h: 22 },
  controls: { w: { min: 40, max: 400, step: 20 }, h: { min: 8, max: 200, step: 4 } },
  render: (props) => (
    <Box gap={12}>
      <Skeleton {...props} />
      <Skeleton {...props} radius="pill" />
    </Box>
  ),
});
