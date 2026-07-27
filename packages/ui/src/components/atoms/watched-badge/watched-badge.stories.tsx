import { story } from '@kroma/workbench/story';
import { WatchedBadge } from './watched-badge';

export default story({
  name: 'WatchedBadge',
  group: 'Media',
  docs: 'The "watched" pill sitting on the corner of a poster.',
  matrix: false,
  args: { size: 28 },
  controls: { size: { min: 16, max: 64, step: 2 } },
  render: (props) => <WatchedBadge {...props} />,
});
