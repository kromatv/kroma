import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import type { IconName } from '#ui/lib/glyph';
import { Chip, chipVariants } from './chip';

export default story({
  name: 'Chip',
  group: 'Actions',
  docs: "A filter or a choice in a row. The active state is carried by the **amber fill**, never by text color alone. A filter that counts something says so in the chip: `dot` for what it is counting, `count` for how many, both in the chip's own ink so they stay legible whichever state it is in.",
  usage: `<Chip label="Sci-Fi" active={selected} onPress={toggle} />

// A filter row that counts: the dot is the status colour, the count trails it.
<Chip label="Running" dot={colors.accent} count={7}
      active={bucket === 'active'} onPress={() => setBucket('active')} />`,
  guidelines: {
    do: [
      'Use `subtle` over ambient artwork - it recedes until focused.',
      'Use the `tv` size on any 10-foot screen: the small target is a mouse target.',
      'Give `dot` the colour the status is drawn in everywhere else, and let the chip decide how to keep it visible.',
    ],
    dont: [
      "Don't use a Chip for a one-off action; that's a Button in a smaller coat.",
      "Don't paint a dot yourself next to the label: on the active fill your colour is the fill's colour, and it disappears.",
    ],
  },
  variants: chipVariants,
  args: { label: 'Added', icon: '' as IconName | '' },
  controls: { icon: 'icon' },
  render: ({ icon, ...props }) => <Chip {...props} icon={icon || undefined} />,
  scenes: [
    {
      name: 'A counting filter row',
      docs: 'The row the console filters are made of. Note the second chip: its status colour IS the accent, so on the active fill a dot of its own colour would be invisible and a pale one would wash out. An active chip paints the dot in ink with the rest of its content, and the fill is what says which filter is on.',
      example: () => (
        <Box gap={14}>
          <Box row gap={10} wrap>
            <Chip label="Queued" dot="rgba(244, 243, 240, 0.45)" count={0} active />
            <Chip label="Running" dot="#F4B642" count={7} />
            <Chip label="Available" dot="#46D08D" count={1} />
            <Chip label="Closed" dot="#E8536A" count={12} />
          </Box>
          <Box row gap={10} wrap>
            <Chip label="Queued" dot="rgba(244, 243, 240, 0.45)" count={0} />
            <Chip label="Running" dot="#F4B642" count={7} active />
            <Chip label="Available" dot="#46D08D" count={1} />
            <Chip label="Closed" dot="#E8536A" count={12} />
          </Box>
        </Box>
      ),
    },
  ],
});
