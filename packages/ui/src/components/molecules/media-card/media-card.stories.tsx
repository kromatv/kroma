import { story } from '@kroma/workbench/story';
import { stillArt } from '#ui/lib/sample-art';
import { MediaCard } from './media-card';

const TINT = ['#3A2E4F', '#1B1524'] as const;

export default story({
  name: 'MediaCard',
  group: 'Media',
  docs: 'The landscape thumbnail of the home rows. It carries its own scrim so the title stays readable over any artwork.',
  matrix: false,
  args: {
    title: 'Blade Runner 2049',
    overline: 'Science fiction',
    progress: 0.35,
    watched: false,
    width: 320,
    artwork: true,
  },
  controls: {
    progress: { min: 0, max: 1, step: 0.05 },
    width: { min: 160, max: 480, step: 20 },
  },
  render: ({ artwork, ...props }) => (
    <MediaCard {...props} art={artwork ? stillArt(0) : null} tint={TINT} />
  ),
  scenes: [
    {
      name: 'No artwork',
      docs: 'The scrim still has to keep the title readable when only the tint is there.',
      args: { artwork: false },
    },
  ],
});
