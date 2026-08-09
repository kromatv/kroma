import { story } from '@kroma/workbench/story';
import { Spinner } from './spinner';

export default story({
  name: 'Spinner',
  group: 'Feedback',
  docs: 'The indeterminate waiting indicator. Animated with Animated rather than CSS keyframes, which makes it correct on all four targets and immune to the animation freeze of a hidden window.',
  matrix: false,
  args: { size: 28, thickness: 3 },
  controls: { size: { min: 16, max: 96, step: 4 }, thickness: { min: 1, max: 8, step: 1 } },
  render: (props) => <Spinner {...props} />,
});
