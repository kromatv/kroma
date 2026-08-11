import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Radio, radioVariants } from './radio';

const MODES = [
  { value: 'auto', label: 'Auto' },
  { value: 'direct', label: 'Lecture directe' },
  { value: 'transcode', label: 'Transcodage' },
];

function Demo({ size }: Readonly<{ size: 'sm' | 'tv' }>) {
  const [mode, setMode] = useState('auto');
  return (
    <Box gap={14} role="radiogroup" accessibilityLabel="Mode de lecture">
      {MODES.map((m) => (
        <Box key={m.value} row align="center" gap={10}>
          <Radio
            size={size}
            label={m.label}
            checked={mode === m.value}
            onChange={() => setMode(m.value)}
          />
          <Text variant="body" color={mode === m.value ? 'text' : 'textMuted'}>
            {m.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

export default story({
  name: 'Radio',
  group: 'Input',
  docs: 'The one-of-N control. Unlike a checkbox it cannot be un-picked by pressing it again - the only way out of a choice is another choice - so a press on the chosen radio reports nothing and the group owns which one is on. A radio never travels alone: it belongs to a `radiogroup`, which is what `<ChoiceList.Root>` draws for you.',
  usage: `<Box role="radiogroup" accessibilityLabel="Mode de lecture">
  {MODES.map((m) => (
    <Radio key={m.value} label={m.label} checked={mode === m.value} onChange={() => setMode(m.value)} />
  ))}
</Box>`,
  guidelines: {
    do: [
      'Wrap a set in a `radiogroup` with a name: a lone radio tells a screen reader nothing about what it chooses between.',
      'Reach for <ChoiceList> when the rows carry labels, hints or actions.',
    ],
    dont: [
      "Don't offer two or three short options as radios - that is a <SegmentedControl>, which shows every answer at once.",
      "Don't let a radio un-pick itself; a choice group is never empty once made.",
    ],
  },
  variants: radioVariants,
  matrix: false,
  args: { size: 'sm' as 'sm' | 'tv' },
  controls: { size: ['sm', 'tv'] },
  render: ({ size }) => <Demo size={size} />,
});
