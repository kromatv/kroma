import { story } from '@kroma/workbench/story';
import type { WheelSpin } from '#ui/lib/wheel-paths';
import { Logo } from './logo';

export default story({
  name: 'Logo',
  group: 'Brand',
  docs: "The KROMA lockup, color wheel included. This is the only copy of the brand's vector paths in the whole repository: everything that displays the logo goes through here.",
  matrix: false,
  args: { size: 48, markOnly: false, spin: 'none' as WheelSpin },
  controls: { size: { min: 16, max: 160, step: 8 }, spin: ['none', 'once', 'loop'] },
  render: (props) => <Logo {...props} />,
});
