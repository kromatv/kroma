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
  // A range: one fixed width never shows the title truncating against the pill.
  width: { min: 480, max: 1100 },
  args: {
    title: 'Blade Runner 2049',
    subtitle: '2017 · 2h 44m',
    warn: '',
    backFocused: false,
  },
  render: ({ warn, ...props }) => (
    // The bar positions itself absolutely, so the story gives it a surface to
    // sit on, deep enough to see the scrim fade out.
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
