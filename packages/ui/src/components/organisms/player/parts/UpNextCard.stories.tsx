import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { stillArt } from '#ui/lib/sample-art';
import { UP_NEXT_COLUMNS, UP_NEXT_GAP, UpNextCard } from './UpNextCard';

/** The sheet's own row, as data: an episode carries its own id, so the row keys
 *  on the episode rather than on where it happens to sit. */
const ROW = Array.from({ length: UP_NEXT_COLUMNS }, (_, at) => ({
  id: `up-next-${at + 5}`,
  title: `Episode ${at + 5}`,
  subtitle: `S1 E${at + 5}`,
  durationLabel: '54 min',
  categoryLabel: 'Episode',
  posterUrl: stillArt(at),
}));

export default story({
  name: 'UpNextCard',
  group: 'Media',
  docs: 'One candidate in the up-next sheet: a 16:9 still, the title, and the kind of thing it is. With no still it falls back to a deterministic amber-into-charcoal gradient derived from the id, so the same episode always gets the same placeholder rather than flickering between reloads.',
  usage: `<UpNextCard item={next} focused={nav.at === index} onActivate={play} onFocus={focus} />`,
  guidelines: {
    do: ['Give it a 16:9 still; a poster crops badly at this ratio.'],
    dont: ["Don't put the duration in the title - `durationLabel` has its own slot."],
  },
  matrix: false,
  // The card is `width: 100%` of its cell by default - the sheet computes the
  // cell from the row it measures - so the story is given a range and passes the
  // width down the same way, rather than pinning the card to one size.
  width: { min: 360, max: 960 },
  args: {
    title: 'The Wolf and the Lion',
    subtitle: 'S1 E5',
    durationLabel: '54 min',
    categoryLabel: 'Episode',
    focused: false as boolean,
    artwork: true,
  },
  render: ({ title, subtitle, durationLabel, categoryLabel, focused, artwork }) => (
    // Capped rather than pinned: one card at 960 would be a hero, not a card.
    <Box maxW={420}>
      <UpNextCard
        item={{
          id: 'up-next-1',
          title,
          subtitle,
          durationLabel,
          categoryLabel,
          posterUrl: artwork ? stillArt(2) : null,
        }}
        focused={focused}
        onActivate={() => {}}
      />
    </Box>
  ),
  scenes: [
    {
      name: 'The sheet row',
      docs: `Three across with ${UP_NEXT_GAP}px gaps, which is the sheet's own layout.`,
      // Thirds of the row rather than three 300pt cards: that IS the sheet's
      // layout - it divides the width it measures by three - so the scene shows
      // the same arithmetic instead of one width where it happens to land.
      render: ({ focused }) => (
        <Box row gap={UP_NEXT_GAP}>
          {ROW.map((item) => (
            <Box key={item.id} flex>
              <UpNextCard
                item={item}
                focused={Boolean(focused) && item.id === ROW[0]?.id}
                onActivate={() => {}}
              />
            </Box>
          ))}
        </Box>
      ),
    },
    {
      name: 'No still',
      docs: 'The placeholder gradient is derived from the id, so it never flickers.',
      args: { artwork: false },
    },
  ],
});
