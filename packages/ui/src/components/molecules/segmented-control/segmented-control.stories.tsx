import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { SegmentedControl } from './segmented-control';

const MODES = [
  { value: 'auto', label: 'Auto', desc: 'Recommended' },
  { value: 'direct', label: 'Direct play' },
  { value: 'transcode', label: 'Transcode', desc: 'CPU heavy' },
] as const;

function Demo({ withDescs }: Readonly<{ withDescs: boolean }>) {
  const [mode, setMode] = useState<string>('auto');
  const options = withDescs ? MODES : MODES.map(({ value, label }) => ({ value, label }));
  return (
    <SegmentedControl.Root
      label="Playback mode"
      value={mode}
      options={options}
      onValueChange={setMode}
    />
  );
}

export default story({
  name: 'SegmentedControl',
  group: 'Input',
  docs: 'One selected option among a few, all visible at once - the choice a dropdown would hide. A **radiogroup** to assistive tech: each segment is a radio carrying its checked state, and on a physical keyboard the arrow keys move the selection the way a native radio group does. An option can carry a quieter `desc` second line for the fact that settles the choice.',
  usage: `<SegmentedControl.Root
  label="Playback mode"
  value={mode}
  options={[
    { value: 'auto', label: 'Auto', desc: 'Recommended' },
    { value: 'direct', label: 'Direct play' },
  ]}
  onValueChange={setMode}
/>`,
  guidelines: {
    do: [
      'Use it for two to four options that fit on one line.',
      'Name the group with `label` - it is what a screen reader announces first.',
    ],
    dont: [
      "Don't reach for it past four options - that is a <Select>.",
      "Don't use it for an on/off pair - that is a <Switch>.",
    ],
  },
  matrix: false,
  args: { withDescs: true },
  render: ({ withDescs }) => (
    <Box gap={16}>
      <Demo withDescs={withDescs} />
    </Box>
  ),
});
