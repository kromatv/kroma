import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Switch } from '#ui/components/atoms/switch';
import { Txt } from '#ui/components/atoms/text';
import { ListRow, listRowVariants } from './list-row';

export default story({
  name: 'ListRow',
  group: 'Layout',
  docs: "A focusable menu or settings row. This shape had been written three times before landing here: the television's profile menu, the out-of-session settings, and the admin's lists.",
  usage: `<ListRow icon="settings" label="Playback" hint="Quality, subtitles" onPress={open} />
<ListRow icon="power" label="Sign out" trailing={<Badge tone="neutral">3 devices</Badge>} />`,
  guidelines: {
    do: [
      'Give `trailing` a value, a Switch or a Badge; a row that navigates gets the chevron for free.',
      'Use `hint` for the rows that need explaining - one line, not a paragraph.',
    ],
    dont: ["Don't nest another Focusable inside the row; the row IS the focus target."],
  },
  variants: listRowVariants,
  // The row is `width: 100%` of whatever holds it, so the canvas has to say how
  // wide that is. A range rather than a number: a settings column and a TV menu
  // are different widths, and the label truncating is what has to hold in both.
  width: { min: 320, max: 640 },
  args: { icon: 'settings', label: 'Language', hint: '' },
  controls: { icon: 'icon' },
  // `minW` as well as the story's width, because a matrix cell is sized by its
  // content: a row that is 100% of nothing collapses onto its own glyph.
  render: ({ hint, ...props }) => (
    <Box minW={320}>
      <ListRow {...props} hint={hint || undefined} onPress={() => {}} />
    </Box>
  ),
  scenes: [
    {
      name: 'A list',
      render: ({ hint, ...props }) => (
        <Box minW={320} gap={10}>
          <ListRow {...props} onPress={() => {}} />
          <ListRow
            icon="language"
            label="Audio"
            hint="Default track"
            trailing={
              <Txt color="accent" style={{ fontSize: 16, fontWeight: '600' }}>
                English
              </Txt>
            }
            onPress={() => {}}
          />
          <ListRow
            icon="wave-sine"
            label="Volume leveling"
            trailing={<Switch checked onChange={() => {}} />}
          />
          <ListRow icon="logout" label="Sign out" onPress={() => {}} />
        </Box>
      ),
    },
  ],
});
