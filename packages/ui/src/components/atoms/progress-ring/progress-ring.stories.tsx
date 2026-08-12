import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { ProgressRing } from './progress-ring';

export default story({
  name: 'ProgressRing',
  group: 'Feedback',
  docs: 'The progress ring, in SVG. It replaces a CSS conic-gradient, which exists neither on Apple TV nor in old television browsers. The arc eases to each new value rather than jumping to it; `indeterminate` spins a quarter arc for work whose share is unknown.',
  matrix: false,
  component: ProgressRing,
  args: { value: 0.62, size: 64, thickness: 6, indeterminate: false },
  controls: {
    value: { min: 0, max: 1, step: 0.05 },
    size: { min: 24, max: 160, step: 8 },
    thickness: { min: 2, max: 16, step: 1 },
  },
  scenes: [
    {
      name: 'Determinate and indeterminate',
      docs: 'The same ring answering a known share, and answering "still working".',
      render: ({ value, size, thickness }) => (
        <Box row align="center" gap={32}>
          <ProgressRing value={value} size={size} thickness={thickness} />
          <ProgressRing size={size} thickness={thickness} indeterminate />
        </Box>
      ),
    },
  ],
});
