import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Ground } from '#ui/components/atoms/ground';
import { posterArt } from '#ui/lib/sample-art';
import { CreditsCard } from './CreditsCard';

export default story({
  name: 'CreditsCard',
  group: 'Player',
  docs: 'The card that appears over the credits: what is next, and a ring draining towards autoplay. `secondsLeft` and `total` are separate so the ring is drawn from the fraction rather than from a timer of its own — the player owns the countdown, and this only renders where it has got to.',
  usage: `<CreditsCard
  item={{ title: next.title, subtitle: next.episodeLabel, posterUrl: next.poster }}
  secondsLeft={countdown}
  total={AUTOPLAY_SECONDS}
  playFocused={nav.at === 'play'}
  cancelFocused={nav.at === 'cancel'}
  onPlay={playNext}
  onCancel={stopAutoplay}
/>`,
  guidelines: {
    do: [
      'Keep the countdown in the player and pass its position in; the card is not a timer.',
      'Always offer the cancel: autoplay that cannot be stopped is a complaint.',
    ],
    dont: ["Don't let `secondsLeft` exceed `total` - the ring would read as full forever."],
  },
  matrix: false,
  // The card pins itself to a corner of the player and carries its own 392pt
  // width, so what the story varies is the surface around it.
  width: { min: 560, max: 1100 },
  // The corner it pins to is the RIGHT one, so a stage narrower than `min` (a
  // phone) opens its scroller with the card half off canvas. The TV frame shows
  // it where it sits; `Fit` stays one press away.
  viewport: 'tv',
  args: {
    title: 'The Pointy End',
    subtitle: 'S1 E8',
    secondsLeft: 3,
    total: 5,
    playFocused: true,
    cancelFocused: false,
  },
  controls: { secondsLeft: { min: 0, max: 10, step: 1 }, total: { min: 1, max: 10, step: 1 } },
  render: ({ title, subtitle, ...props }) => (
    <Ground tone="dark">
      <Box aspect={16 / 9} minH={400} bg="surface2" radius="lg" overflow="hidden">
        <CreditsCard
          {...props}
          item={{ title, subtitle, posterUrl: posterArt(1) }}
          onPlay={() => {}}
          onCancel={() => {}}
        />
      </Box>
    </Ground>
  ),
  scenes: [
    {
      name: 'About to fire',
      docs: 'One second left: the ring is nearly drained.',
      args: { secondsLeft: 1 },
    },
    {
      name: 'Cancel focused',
      args: { playFocused: false, cancelFocused: true },
    },
  ],
});
