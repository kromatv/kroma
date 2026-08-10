import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { stillArt } from '#ui/lib/sample-art';
import type { UpNextItem } from './UpNextCard';
import { UpNextSheet } from './UpNextSheet';

const episode = (at: number): UpNextItem => ({
  id: `ep-${at}`,
  title: ['The Kingsroad', 'Lord Snow', 'Cripples and Broken Things'][at] ?? `Episode ${at + 2}`,
  subtitle: `S1 E${at + 2}`,
  posterUrl: stillArt(at),
  categoryLabel: 'Episode',
});

const recommendation = (at: number): UpNextItem => ({
  id: `rec-${at}`,
  title: ['Blade Runner 2049', 'Arrival', 'Dune'][at] ?? `Title ${at}`,
  subtitle: ['2017', '2016', '2021'][at] ?? '',
  posterUrl: stillArt(at + 3),
  categoryLabel: 'Science fiction',
});

const DATA = {
  nextEpisodes: [0, 1, 2].map(episode),
  recommendations: [0, 1, 2].map(recommendation),
};

export default story({
  name: 'UpNextSheet',
  group: 'Player',
  docs: 'What plays after this one. It has three states rather than two: parked (a **peek** of the sheet above the bottom edge, shown only when the chrome is revealed and there is actually something next), open (it rises and captures the D-pad), and gone. The peek is what makes it discoverable on a television, where there is no hover and no scrollbar to hint that something is below.',
  usage: `<UpNextSheet
  data={upNext}
  open={overlay === 'sheet'}
  revealed={chromeVisible}
  onOpen={() => setOverlay('sheet')}
  onClose={() => setOverlay(null)}
  onPlay={playItem}
/>`,
  guidelines: {
    do: [
      'Show the peek only when the chrome is revealed AND there is data - an empty peek is a lie.',
      'Let it capture the D-pad while open; a half-focused sheet is unnavigable on a remote.',
    ],
    dont: ["Don't open it automatically mid-film; the credits card is what does that."],
  },
  matrix: false,
  // The sheet derives its three-across card width from the row it MEASURES, so
  // it must be given a real width and never scaled - and a range is the honest
  // one, since that arithmetic is the thing worth watching as the surface moves.
  width: { min: 720, max: 1280 },
  args: { open: true, revealed: true, empty: false },
  render: ({ open, revealed, empty }) => (
    // The sheet positions itself against the player surface and rises to ~62% of
    // it, so the story gives it one shaped like the picture, with a floor under
    // it so the cards still have room at the narrow end.
    <Box aspect={16 / 9} minH={560} bg="surface2" radius="lg" overflow="hidden">
      <UpNextSheet
        data={empty ? { nextEpisodes: [], recommendations: [] } : DATA}
        open={open}
        revealed={revealed}
        onOpen={() => {}}
        onClose={() => {}}
        onPlay={() => {}}
      />
    </Box>
  ),
  scenes: [
    {
      name: 'Parked (peek)',
      docs: 'Closed but revealed: the strip above the bottom edge is the whole affordance.',
      args: { open: false, revealed: true },
    },
    {
      name: 'Nothing next',
      docs: 'No episodes and no recommendations, so there is no peek to show.',
      args: { open: false, revealed: true, empty: true },
    },
  ],
});
