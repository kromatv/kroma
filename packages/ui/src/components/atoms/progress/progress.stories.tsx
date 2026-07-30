import { story } from '@kroma/workbench/story';
import { Progress } from './progress';

export default story({
  name: 'Progress',
  group: 'State',
  docs: "The playback progress bar: the one running under a partially watched thumbnail, and the player's own. The value is clamped to 0..1 by the component itself.",
  matrix: false,
  // It takes whatever width it is given, so a range rather than the one width
  // that would hide a bug at any other.
  width: { min: 240, max: 640 },
  args: { value: 0.42, size: 4, rounded: false },
  controls: { value: { min: 0, max: 1, step: 0.05 }, size: { min: 2, max: 16, step: 1 } },
  render: (props) => <Progress {...props} />,
});
