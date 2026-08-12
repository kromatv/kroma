import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { PosterCard } from '#ui/components/molecules/poster-card';
import { posterArt } from '#ui/lib/sample-art';
import { VirtualGrid } from './virtual-grid';

const TINT = ['#3A2E4F', '#1B1524'] as const;

const TITLES = Array.from({ length: 400 }, (_, at) => ({ id: at, title: `Title ${at + 1}` }));

const TILE_W = 203;
const ROW_HEIGHT = Math.round((TILE_W * 3) / 2) + 32;

export default story({
  name: 'VirtualGrid',
  group: 'Media',
  docs: "The browse screens' poster grid: a library of thousands, of which only the rows near the viewport are mounted. Focus reaches the end anyway, because the navigator registers a *virtual* node per row that outlives the tile rendered into it. On the web the wheel scrolls it too — and that moves the selection, unlike a `VirtualRail`'s wheel, because the navigator's `scrollTo` is implemented as a focus grab.",
  usage: `<VirtualGrid
  data={cards}
  columns={8}
  itemHeight={336}
  style={{ flex: 1, minHeight: 0 }}
  contentStyle={{ paddingHorizontal: 64 }}
  rowStyle={{ gap: 24 }}
  renderItem={(c, i) => <PosterCard title={c.title} art={c.poster} autoFocus={i === 0} />}
/>`,
  guidelines: {
    do: [
      'Give the grid a bounded height (`flex: 1`): it is the viewport, and it is what clips.',
      'Put the padding in `contentStyle` — on the viewport it insets the clip and shaves the rows.',
      '`itemHeight` is the row PITCH: the tile plus the gap beneath it.',
    ],
    dont: [
      "Don't use it for a handful of tiles; a plain wrapped Box costs less.",
      "Don't give it rows of different heights: the offset maths assumes one pitch.",
    ],
  },
  matrix: false,
  width: { min: 640, max: 1600 },
  args: { columns: 8, count: 400 },
  controls: {
    columns: { min: 2, max: 10, step: 1 },
    count: { min: 40, max: 400, step: 40 },
  },
  render: ({ columns, count }) => (
    <Box style={{ height: 620 }}>
      <VirtualGrid
        data={TITLES.slice(0, count)}
        columns={columns}
        itemHeight={ROW_HEIGHT}
        style={{ flex: 1, minHeight: 0 }}
        // paddingTop = FOCUS_BLEED: the grid clips flush at its top, so a focused
        // row's ring room has to come from the content.
        contentStyle={{ paddingHorizontal: 24, paddingTop: 32 }}
        rowStyle={{ gap: 24 }}
        renderItem={(item, at) => (
          <PosterCard
            title={item.title}
            art={posterArt(at)}
            tint={TINT}
            width={TILE_W}
            autoFocus={at === 0}
          />
        )}
      />
    </Box>
  ),
});
