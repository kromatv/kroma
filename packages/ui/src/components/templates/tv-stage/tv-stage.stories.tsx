import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Txt } from '#ui/components/atoms/text';
import { TvStage } from './tv-stage';

export default story({
  name: 'TvStage',
  group: 'Layout',
  docs: 'The 1920x1080 canvas every 10-foot screen is authored against, scaled to fit whatever the platform actually gives. It is the reason a rail tile looks identical on a Samsung panel and an Apple TV: Tizen and webOS report 1920x1080 CSS px, tvOS reports 1920x1080 points, and Android TV reports **960x540 dp** at density 2.0 — without the stage an Android TV renders the whole design at double size. It also contains, never covers, so an unusual aspect ratio letterboxes rather than losing the overscan-safe gutters.',
  usage: `// Each platform shell wraps the shared app in it, once:
<TvStage>
  <TvApp platform="AppleTV" />
</TvStage>`,
  guidelines: {
    do: [
      'Wrap the app in it ONCE, in the platform shell, and never again inside a screen.',
      'Author every screen in plain numbers against 1920x1080: the stage makes them literal.',
    ],
    dont: [
      "Don't nest one stage in another - the scale would compound.",
      "Don't reach for a viewport unit inside it; the canvas is fixed, so `82` already means 82.",
    ],
  },
  matrix: false,
  // A RANGE, not a number: a story pinned to one width is the one case the
  // stage is never asked to handle.
  width: { min: 480, max: 1280 },
  pad: 0,
  args: {},
  render: () => (
    <Box aspect={16 / 9} overflow="hidden" bg="surface1" radius="lg">
      <TvStage>
        <Box flex px={64} py={48} gap={24} justify="center">
          <Txt variant="overline" color="accentText">
            1920 x 1080
          </Txt>
          <Txt variant="hero">Everything is authored here</Txt>
          <Txt variant="body" color="textMuted">
            The gutters are the design's 64pt, overscan-safe on every panel we ship to.
          </Txt>
          <Box row gap={16}>
            <Button size="tv" icon="player-play-filled" label="Play" />
            <Button variant="glass" size="tv" label="More" />
          </Box>
        </Box>
      </TvStage>
    </Box>
  ),
});
