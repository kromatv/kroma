import { story } from '@kroma/workbench/story';
import type { WheelSpin } from '#ui/lib/wheel-paths';
import { Wheel } from './wheel';

export default story({
  name: 'Wheel',
  group: 'Brand',
  docs: 'The color wheel on its own, the O of KROMA. It also serves as the branded loading indicator when the apps open.',
  matrix: false,
  args: { size: 96, spin: 'none' as WheelSpin },
  controls: { size: { min: 24, max: 240, step: 8 }, spin: ['none', 'once', 'loop'] },
  render: (props) => <Wheel {...props} />,
});
