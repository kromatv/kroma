import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { TopBar } from './TopBar';

export default story({
  name: 'PlayerTopBar',
  group: 'Media',
  docs: "The player's own header: what is playing, a way out, and a warning pill when the stream is not what the viewer asked for (a transcode, a missing track). It sits under a scrim rather than a solid bar so the artwork behind it still reads. `backFocused` is passed in rather than owned here because the player's nav machine decides where focus rests — the chrome only draws it.",
  usage: `<TopBar
  title={item.title}
  subtitle={episodeLabel}
  warn={transcoding ? t('player.transcodeWarning') : null}
  backFocused={nav.zone === 'back'}
  onBack={leave}
/>`,
  guidelines: {
    do: [
      'Pass `warn` a PRE-TRANSLATED line: the chrome does not decide wording.',
      'Keep `subtitle` to the episode or the year - the title is the thing being read.',
    ],
    dont: ["Don't own focus here; the player's nav machine does, and it tells the bar."],
  },
  matrix: false,
  // A range rather than 900: the bar is the full width of the player on every
  // surface it ships to, and the title truncating against the warning pill is
  // exactly the thing one fixed width would never show.
  width: { min: 480, max: 1100 },
  args: {
    title: 'Blade Runner 2049',
    subtitle: '2017 · 2h 44m',
    warn: '',
    backFocused: false,
  },
  render: ({ warn, ...props }) => (
    // The bar positions itself absolutely against the player surface, so the
    // story gives it one to sit on: as wide as the canvas allows, and deep
    // enough that the scrim under the bar is seen fading out rather than being
    // cut off at the edge of the box.
    <Box minH={200} bg="surface2" radius="lg" overflow="hidden">
      <TopBar {...props} warn={warn || null} onBack={() => {}} />
    </Box>
  ),
  scenes: [
    {
      name: 'Warning',
      docs: 'The pill only appears when there is something to say about the stream.',
      args: { warn: 'Transcoding: this device cannot direct-play HEVC' },
    },
    {
      name: 'Back focused',
      docs: 'What the remote resting on the way out looks like.',
      args: { backFocused: true },
    },
  ],
});
