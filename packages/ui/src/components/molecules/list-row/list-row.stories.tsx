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
  usage: `<ListRow.Root icon="settings" label="Lecture" hint="Qualité, sous-titres" onPress={open} />

<ListRow.Root onPress={open}>
  <ListRow.Leading><Avatar name="Maxime" size={34} circle /></ListRow.Leading>
  <ListRow.Label>Maxime</ListRow.Label>
  <ListRow.Trailing><SwitchFace checked /></ListRow.Trailing>
</ListRow.Root>`,
  guidelines: {
    do: [
      'Write the common row with `label`, `hint` and `icon`; reach for the parts when the row is more than that.',
      'Put media in `<ListRow.Leading>`: an avatar, a poster thumb, a module icon, a status dot.',
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
  args: { icon: 'settings', label: 'Langue', hint: '' },
  controls: { icon: 'icon' },
  // `minW` as well as the story's width, because a matrix cell is sized by its
  // content: a row that is 100% of nothing collapses onto its own glyph.
  render: ({ hint, ...props }) => (
    <Box minW={320}>
      <ListRow.Root {...props} hint={hint || undefined} onPress={() => {}} />
    </Box>
  ),
  scenes: [
    {
      name: 'Une liste',
      render: ({ hint, ...props }) => (
        <Box minW={320} gap={10}>
          <ListRow.Root {...props} onPress={() => {}} />
          <ListRow.Root icon="language" label="Audio" hint="Piste par défaut" onPress={() => {}}>
            <ListRow.Trailing>
              <Text color="accentText">Français</Text>
            </ListRow.Trailing>
          </ListRow.Root>
          <ListRow.Root icon="wave-sine" label="Nivellement du volume">
            <ListRow.Trailing>
              <SwitchFace checked />
            </ListRow.Trailing>
          </ListRow.Root>
          <ListRow.Root icon="logout" label="Se déconnecter" onPress={() => {}} />
        </Box>
      ),
    },
    {
      name: 'Média en tête',
      docs: 'The head of the row takes an avatar, a poster thumb or a status dot as readily as a glyph.',
      render: () => (
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
            <ListRow.Label>Le Bon, la Brute et le Truand</ListRow.Label>
            <ListRow.Hint>1966 · 2 h 41</ListRow.Hint>
            <ListRow.Trailing>
              <Badge tone="4K">4K</Badge>
            </ListRow.Trailing>
          </ListRow.Root>
          <ListRow.Root label="Salon" hint="salon.local">
            <ListRow.Leading>
              <StatusDot online />
            </ListRow.Leading>
          </ListRow.Root>
        </Box>
      ),
    },
    {
      name: 'Un groupe',
      docs: 'One card for the whole list: the group carries the surface and declares the size its members take.',
      render: () => (
        <Box minW={320}>
          <ListRow.Group size="sm">
            <ListRow.Root icon="language" label="Langue" hint="Français" onPress={() => {}} />
            <ListRow.Root icon="device-tv" label="Appareils" onPress={() => {}} />
            <ListRow.Root icon="info-circle" label="À propos" onPress={() => {}} />
          </ListRow.Group>
        </Box>
      ),
    },
  ],
});
