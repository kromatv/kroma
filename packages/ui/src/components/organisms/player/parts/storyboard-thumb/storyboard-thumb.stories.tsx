import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { stillArt } from '#ui/lib/sample-art';
import { fakeTileAt } from '../../player.fixture';
import { StoryboardThumb } from './storyboard-thumb';

const tileAt = fakeTileAt([stillArt(0), stillArt(1), stillArt(2), stillArt(3)]);

export default story({
  name: 'StoryboardThumb',
  group: 'Player',
  docs: "The frame shown above the playhead while seeking. A storyboard is ONE sprite sheet holding every thumbnail of the film, and a tile is a **window** onto it: the sheet is positioned by `offsetX/offsetY` so the wanted frame lands in the window. The sheet is drawn at its own pixel size and then scaled as a layer. Asking the decoder for `sheetWidth * scale` pixels instead is what silently produces a black rectangle on a television, because a 2560px sheet blown up past the GPU's texture limit is simply not drawn, with no error anywhere.",
  usage: `// The seek bar asks the storyboard for a tile at a position:
const tile = storyboard.tile(sec, 220);
{tile ? <StoryboardThumb tile={tile} /> : null}`,
  guidelines: {
    do: [
      'Ask for the DISPLAY width you want; the tile carries the scale to get there.',
      'Render nothing until the sheet is ready: a half-loaded sheet is a black frame.',
    ],
    dont: [
      "Don't scale the image by asking for more pixels; scale the layer, or the GPU drops it.",
    ],
  },
  matrix: false,
  args: { positionSec: 600, width: 220 },
  controls: {
    positionSec: { min: 0, max: 9600, step: 300 },
    width: { min: 120, max: 420, step: 20 },
  },
  render: ({ positionSec, width }) => {
    const tile = fakeTileAt(
      [stillArt(0), stillArt(1), stillArt(2), stillArt(3)],
      width,
    )(positionSec);
    return (
      <Box gap={12} align="flex-start">
        <StoryboardThumb tile={tile} />
        <Text variant="meta" color="textDim">
          {`Frame at ${Math.floor(positionSec / 60)} min · drawn from a ${tile.sheetWidth}x${tile.sheetHeight} sheet at scale ${tile.scale.toFixed(2)}`}
        </Text>
      </Box>
    );
  },
  scenes: [
    {
      name: 'A scrub across the film',
      docs: 'Four positions, the way the preview changes as the playhead moves.',
      example: () => (
        <Box row wrap gap={16} align="flex-start">
          {[0, 1500, 3000, 4500].map((sec) => (
            <StoryboardThumb key={sec} tile={tileAt(sec)} />
          ))}
        </Box>
      ),
    },
  ],
});
