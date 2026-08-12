import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Kbd } from './kbd';

function Chord({ keys, label }: Readonly<{ keys: readonly string[]; label: string }>) {
  return (
    <Box row align="center" gap={5}>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      <Text variant="meta" color="textDim">
        {label}
      </Text>
    </Box>
  );
}

export default story({
  name: 'Kbd',
  group: 'Foundations',
  docs: 'One keycap: the mark a shortcut is written with, in prose, in a menu row, or under a search field.\n\nIt is a **face**, never a control. A picture of a key does nothing when it is pressed, and on a television it must not take a D-pad stop away from the control it describes.',
  usage: `<Kbd>esc</Kbd>

<Box row align="center" gap={5}>
  <Kbd>⌘</Kbd>
  <Kbd>K</Kbd>
  <Text variant="meta" color="textDim">search</Text>
</Box>`,
  guidelines: {
    do: [
      'Print the key as the reader sees it on the keyboard: `esc`, `⌘`, `Ctrl`, `↵`.',
      'Put one cap per key, so a chord reads as the two keys it is.',
    ],
    dont: [
      "Don't make one pressable - the shortcut is the affordance, the cap is only its label.",
      "Don't show a keyboard shortcut on a screen that is driven only by a remote.",
    ],
  },
  matrix: false,
  args: { children: 'esc' },
  controls: { children: 'text' },
  render: ({ children }) => <Kbd>{children}</Kbd>,
  scenes: [
    {
      name: 'A chord, and a hint',
      docs: 'One cap per key. The label beside them is ordinary text: a cap is the key, never the sentence.',
      example: () => (
        <Box row align="center" gap={14}>
          <Chord keys={['⌘', 'K']} label="search" />
          <Chord keys={['↑', '↓']} label="navigate" />
          <Chord keys={['↵']} label="select" />
        </Box>
      ),
    },
  ],
});
