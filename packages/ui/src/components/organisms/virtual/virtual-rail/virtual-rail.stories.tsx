import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { PosterCard } from '#ui/components/molecules/poster-card';
import { posterArt } from '#ui/lib/sample-art';
import { VirtualRail } from './virtual-rail';

const TINT = ['#3A2E4F', '#1B1524'] as const;

// Enough tiles that windowing is the point rather than a detail.
const TITLES = Array.from({ length: 400 }, (_, at) => ({ id: at, title: `Title ${at + 1}` }));

export default story({
  name: 'VirtualRail',
  group: 'Media',
  docs: "A `Rail` for a library that is thousands of tiles long: it renders only the tiles near the viewport and translates the content instead of mounting all of them. A television has a fraction of a phone's memory and no compositor to hide the cost, so a 2,000-poster row is the difference between a browse screen and a crash. `itemWidth` is the tile **pitch** — its own width plus the gap after it — because that is what the offset maths needs.",
  usage: `<VirtualRail
  data={titles}
  itemWidth={196}
  style={{ height: 300 }}
  renderItem={(item) => <PosterCard title={item.title} art={art(item)} tint={tint} />}
  onEndReached={loadMore}
/>`,
  guidelines: {
    do: [
      'Give the rail a real height in `style`: it is the viewport that clips.',
      'Measure `itemWidth` as tile width PLUS the gap, or the tiles drift out of step.',
      'Load the next page from `onEndReached`, not from a scroll listener.',
    ],
    dont: [
      "Don't use it for a row of eight - plain `Rail` mounts those in chunks and costs nothing.",
      "Don't put variable-width tiles in it: the windowing assumes one pitch.",
    ],
  },
  matrix: false,
  // Dynamic, the way it ships: the stage's width, clamped. Drag the window and
  // the row re-measures - which is the behaviour a fixed width hid.
  width: { min: 560, max: 1400 },
  args: { itemWidth: 196, count: 400, edgeMargin: 1 },
  controls: {
    itemWidth: { min: 120, max: 320, step: 4 },
    count: { min: 20, max: 400, step: 20 },
    edgeMargin: { min: 0, max: 3, step: 1 },
  },
  render: ({ itemWidth, count, edgeMargin }) => (
    <Box gap={12}>
      <VirtualRail
        data={TITLES.slice(0, count)}
        itemWidth={itemWidth}
        edgeMargin={edgeMargin}
        style={{ height: 300 }}
        contentStyle={{ paddingHorizontal: 4 }}
        // The first tile takes focus when the story opens: a rail is a
        // NAVIGATION component, and one that nothing can be focused inside is a
        // picture of a row rather than a row.
        // The tile fills its cell and the gap lives INSIDE the pitch: the row
        // fits a whole number of pitches to the width it is given, so a tile
        // that sized itself would not add up.
        renderItem={(item, at) => (
          <Box px={8}>
            <PosterCard title={item.title} art={posterArt(at)} tint={TINT} autoFocus={at === 0} />
          </Box>
        )}
      />
    </Box>
  ),
});
