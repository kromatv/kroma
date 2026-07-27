import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { posterArt } from '#ui/lib/sample-art';
import { PosterCard } from './poster-card';

const TINT = ['#3A2E4F', '#1B1524'] as const;

export default story({
  name: 'PosterCard',
  group: 'Media',
  docs: 'The portrait poster of the library grids. Same focus model as the landscape thumbnail, different ratio.',
  usage: `<PosterCard title={item.title} art={client.resolveArt(item.posterUrl)} tint={item.tint} progress={item.progress} onPress={open} />`,
  guidelines: {
    do: ['Pass `progress` only for something actually started; `null` hides the bar.'],
    dont: ["Don't put a title under the poster AND on it - the artwork usually has one."],
  },
  matrix: false,
  // `width` is a real prop of the component, and on the canvas it is also the
  // thing that makes it visible at all: a poster fills its grid cell (width
  // 100%), and the workbench stage is sized by its content, so with no width to
  // fill the tile collapses to nothing. A grid gives it the cell; here the
  // control does, the way <MediaCard> is shown.
  args: { title: 'Dune', progress: 0, watched: false, width: 170, artwork: true },
  controls: {
    progress: { min: 0, max: 1, step: 0.05 },
    width: { min: 110, max: 320, step: 10 },
  },
  render: ({ progress, artwork, ...props }) => (
    <PosterCard
      {...props}
      progress={progress || null}
      art={artwork ? posterArt(0) : null}
      tint={TINT}
    />
  ),
  scenes: [
    {
      name: 'A shelf',
      docs: 'Six posters as a library grid renders them, each with its own artwork. They follow the `width` control, so the shelf reflows the way a grid column does.',
      render: ({ progress, artwork, ...props }) => (
        <Box row wrap gap={20}>
          {Array.from({ length: 6 }, (_, at) => (
            <PosterCard
              key={posterArt(at)}
              {...props}
              title={`Title ${at + 1}`}
              art={artwork ? posterArt(at) : null}
              tint={TINT}
              progress={at === 1 ? 0.4 : null}
              watched={at === 3}
            />
          ))}
        </Box>
      ),
    },
    {
      name: 'No artwork',
      docs: 'The tint gradient carries the tile when the art is missing.',
      args: { artwork: false },
    },
  ],
});
