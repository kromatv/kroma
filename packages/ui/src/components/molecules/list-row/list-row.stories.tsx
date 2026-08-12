import { story } from '@kroma/workbench/story';
import { Avatar } from '#ui/components/atoms/avatar';
import { Badge } from '#ui/components/atoms/badge';
import { Box } from '#ui/components/atoms/box';
import { StatusDot } from '#ui/components/atoms/status-dot';
import { SwitchFace } from '#ui/components/atoms/switch';
import { Text } from '#ui/components/atoms/text';
import { ListRow, listRowVariants } from './list-row';

export default story({
  name: 'ListRow',
  group: 'Layout',
  docs: "A focusable menu or settings row, composed of named parts. This shape had been written three times before landing here: the television's profile menu, the out-of-session settings, and the admin's lists.",
  usage: `<ListRow.Root icon="settings" onPress={open}>
  <ListRow.Label>Playback</ListRow.Label>
  <ListRow.Hint>Quality, subtitles</ListRow.Hint>
</ListRow.Root>

<ListRow.Root onPress={open}>
  <ListRow.Leading><Avatar name="Maxime" size={34} circle /></ListRow.Leading>
  <ListRow.Label>Maxime</ListRow.Label>
  <ListRow.Trailing><SwitchFace checked /></ListRow.Trailing>
</ListRow.Root>`,
  guidelines: {
    do: [
      'Write the title first: the first plain text in the middle column names the row.',
      'Keep a glyph on `icon`, and put media in `<ListRow.Leading>`: an avatar, a poster thumb, a status dot.',
      'Let `size` come from the app (`setEntryDefaults`) or from the group, and state it only where one row differs.',
    ],
    dont: [
      "Don't nest another Focusable inside the row; the whole row is the control.",
      "Don't put a control in `<ListRow.Trailing>` where a face will do - a <SwitchFace> reads as a switch without stealing the row's press.",
    ],
  },
  variants: listRowVariants,
  omit: ['standalone', 'pressable'],
  // The row is `width: 100%` of whatever holds it, so the canvas has to say how
  // wide that is. A range rather than a number: a settings column and a TV menu
  // are different widths, and the label truncating is what has to hold in both.
  width: { min: 320, max: 640 },
  args: { icon: 'settings', label: 'Language', hint: '' },
  controls: { icon: 'icon' },
  // `minW` as well as the story's width, because a matrix cell is sized by its
  // content: a row that is 100% of nothing collapses onto its own glyph.
  render: ({ icon, label, hint }) => (
    <Box minW={320}>
      <ListRow.Root icon={icon} onPress={() => {}}>
        <ListRow.Label>{label}</ListRow.Label>
        {hint ? <ListRow.Hint>{hint}</ListRow.Hint> : null}
      </ListRow.Root>
    </Box>
  ),
  scenes: [
    {
      name: 'A list',
      render: ({ icon, label, hint }) => (
        <Box minW={320} gap={10}>
          <ListRow.Root icon={icon} onPress={() => {}}>
            <ListRow.Label>{label}</ListRow.Label>
            {hint ? <ListRow.Hint>{hint}</ListRow.Hint> : null}
          </ListRow.Root>
          <ListRow.Root icon="language" onPress={() => {}}>
            <ListRow.Label>Audio</ListRow.Label>
            <ListRow.Hint>Default track</ListRow.Hint>
            <ListRow.Trailing>
              <Text color="accentText">English</Text>
            </ListRow.Trailing>
          </ListRow.Root>
          <ListRow.Root icon="wave-sine">
            <ListRow.Label>Volume levelling</ListRow.Label>
            <ListRow.Trailing>
              <SwitchFace checked />
            </ListRow.Trailing>
          </ListRow.Root>
          <ListRow.Root icon="logout" onPress={() => {}}>
            <ListRow.Label>Sign out</ListRow.Label>
          </ListRow.Root>
        </Box>
      ),
    },
    {
      name: 'Media at the head',
      docs: 'The head of the row takes an avatar, a poster thumb or a status dot as readily as a glyph.',
      example: () => (
        <Box minW={320} gap={10}>
          <ListRow.Root onPress={() => {}}>
            <ListRow.Leading>
              <Avatar name="Maxime" size={34} circle />
            </ListRow.Leading>
            <ListRow.Label>Maxime</ListRow.Label>
            <ListRow.Hint>maxime@kroma.tv</ListRow.Hint>
          </ListRow.Root>
          <ListRow.Root onPress={() => {}}>
            <ListRow.Leading>
              <Box w={34} h={50} radius="md" bg="surface3" />
            </ListRow.Leading>
            <ListRow.Label>The Good, the Bad and the Ugly</ListRow.Label>
            <ListRow.Hint>1966 · 2h 41m</ListRow.Hint>
            <ListRow.Trailing>
              <Badge tone="4K">4K</Badge>
            </ListRow.Trailing>
          </ListRow.Root>
          <ListRow.Root>
            <ListRow.Leading>
              <StatusDot online />
            </ListRow.Leading>
            <ListRow.Label>Living room</ListRow.Label>
            <ListRow.Hint>living-room.local</ListRow.Hint>
          </ListRow.Root>
        </Box>
      ),
    },
    {
      name: 'A group',
      docs: 'One card for the whole list: the group carries the surface and declares the size its members take.',
      example: () => (
        <Box minW={320}>
          <ListRow.Group size="sm">
            <ListRow.Root icon="language" onPress={() => {}}>
              <ListRow.Label>Language</ListRow.Label>
              <ListRow.Hint>English</ListRow.Hint>
            </ListRow.Root>
            <ListRow.Root icon="device-tv" onPress={() => {}}>
              <ListRow.Label>Devices</ListRow.Label>
            </ListRow.Root>
            <ListRow.Root icon="info-circle" onPress={() => {}}>
              <ListRow.Label>About</ListRow.Label>
            </ListRow.Root>
          </ListRow.Group>
        </Box>
      ),
    },
  ],
});
