import { story } from '@kroma/workbench/story';
import { ArtScrim } from '#ui/components/atoms/art-scrim';
import { Box, Row } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Img } from '#ui/components/atoms/img';
import { Surface } from '#ui/components/atoms/surface';
import { Text } from '#ui/components/atoms/text';
import { tintGradient } from '#ui/components/molecules/media-card';
import { stillArt } from '#ui/lib/sample-art';
import { Ground } from './ground';

const TINT = tintGradient(['#3A2E4F', '#1B1524']);

function Card({ title, note }: Readonly<{ title: string; note: string }>) {
  return (
    <Surface gap={12}>
      <Text variant="label">{title}</Text>
      <Text variant="meta" color="textMuted">
        {note}
      </Text>
      <Button size="sm" label="Play" icon="player-play" />
    </Surface>
  );
}

export default story({
  name: 'Ground',
  group: 'Foundations',
  docs: "Pins a subtree to one ground while the page around it keeps the reader's. Every colour on a browser target is a custom property, so this is a true scope: one attribute redefines the whole palette for everything inside it, with no re-render and nothing to thread through props. What it is FOR is chrome that lives on artwork rather than on the page: the player is dark on a light app, and so are the buttons floating over a poster and over a hero backdrop. **On native it does nothing.** There is no cascade there and the theme store is one switch for the whole app, so a native surface that must hold one ground spells its own inks instead. Flip the workbench between light and dark and watch the left card below refuse to move.",
  usage: `<Ground tone="dark">
  <IconButton variant="scrim" icon="eye" label={t('catalog.markWatched')} onPress={toggle} />
</Ground>

// The player takes the whole stage, so it takes the ground with it:
<Ground tone="dark" flex>
  {chrome}
</Ground>`,
  guidelines: {
    do: [
      'Wrap the chrome that sits on artwork, so its inks stay right whatever ground the page is on.',
      'Give it `flex` when the subtree has to fill its parent: it renders a <Box>, and a plain one does not stretch.',
      'Keep it as tight as the chrome it pins. A ground around half a page is a second theme nobody asked for.',
    ],
    dont: [
      "Don't use it to theme a native screen: it is a no-op there, and a screen that looks right in the browser will be wrong on the phone and the TV.",
      "Don't reach for it to darken something. It swaps the palette, it paints nothing; the veil over artwork is an <ArtScrim>.",
      "Don't wrap a whole page in one. The reader's choice of ground is the whole point of the switch in the settings.",
    ],
  },
  matrix: false,
  width: { min: 380, max: 620 },
  args: { tone: 'dark' as 'dark' | 'light' },
  controls: { tone: ['dark', 'light'] },
  render: ({ tone }) => (
    <Row gap={16} align="stretch">
      <Ground tone={tone} flex>
        <Card title="Pinned" note={`Always the ${tone} ground.`} />
      </Ground>
      <Box flex>
        <Card title="The page" note="Follows the theme in the footer." />
      </Box>
    </Row>
  ),
  scenes: [
    {
      name: 'Chrome over artwork',
      docs: 'The reason the component exists, as the web client writes it: the corner controls of a poster and a hero sit ON the picture, so they are dark-ground controls whatever the page is. Only the left one is wrapped. On the light theme the right one turns into a pale control on a dark photograph, which is the bug this prevents.',
      example: () => (
        <Box aspect={16 / 9} radius="lg" overflow="hidden">
          <Img src={stillArt(4)} background={TINT} fill />
          <ArtScrim variant="soft" radius="lg" />
          <Box absolute left={14} top={14}>
            <Ground tone="dark">
              <IconButton variant="scrim" diameter={40} icon="arrow-left" label="Back" />
            </Ground>
          </Box>
          <Box absolute right={14} top={14}>
            <IconButton variant="scrim" diameter={40} icon="eye" label="Mark watched" />
          </Box>
        </Box>
      ),
    },
    {
      name: 'Nested',
      docs: 'A scope, not a switch: the nearest ground wins, so a light panel inside dark chrome is written by wrapping the panel. Nothing is toggled and nothing re-renders, which is why the player can hold a dark stage over a light app for the length of a film.',
      example: () => (
        <Ground tone="dark">
          <Box p={16} gap={16} radius="lg" bg="bg">
            <Text variant="meta" color="textMuted">
              Dark chrome
            </Text>
            <Ground tone="light">
              <Card title="A light panel inside it" note="Its own ground, one level down." />
            </Ground>
          </Box>
        </Ground>
      ),
    },
  ],
});
