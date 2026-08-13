import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Progress } from './progress';

export default story({
  name: 'Progress',
  group: 'Feedback',
  docs: "The playback progress bar: the one running under a partially watched thumbnail, and the player's own. The value is clamped to 0..1 by the component itself, and the fill eases to each new one. `indeterminate` sweeps a segment across the track for work whose share is unknown.",
  matrix: false,
  // It takes whatever width it is given, so a range rather than the one width
  // that would hide a bug at any other.
  width: { min: 240, max: 640 },
  component: Progress,
  args: { value: 0.42, thickness: 4, rounded: true, indeterminate: false },
  controls: { value: { min: 0, max: 1, step: 0.05 }, thickness: { min: 2, max: 16, step: 1 } },
  scenes: [
    {
      name: 'Determinate and indeterminate',
      docs: 'The same bar answering a known share, and answering "still working".',
      render: ({ value, thickness, rounded }) => (
        <Box gap={24} self="stretch">
          <Progress value={value} thickness={thickness} rounded={rounded} />
          <Progress thickness={thickness} rounded={rounded} indeterminate />
        </Box>
      ),
    },
  ],
});
