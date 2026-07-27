import { story } from '@kroma/workbench/story';
import { Button } from '#ui/components/atoms/button';
import { EmptyState } from './empty-state';

export default story({
  name: 'EmptyState',
  group: 'State',
  docs: 'The empty screen: an icon, what is missing, and why. The tv variant scales everything up for the 10-foot viewing distance.',
  matrix: false,
  args: {
    icon: 'mood-empty',
    title: 'No results',
    hint: 'Try another term, or check that the server is reachable.',
    tv: false,
  },
  controls: { icon: 'icon' },
  render: (props) => <EmptyState {...props} />,
  scenes: [
    {
      name: 'With action',
      render: (props) => <EmptyState {...props} action={<Button label="Retry" size="sm" />} />,
    },
  ],
});
