import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import type { ControlSize } from '#ui/lib/field-shell';
import { DataField } from './data-field';

export default story({
  name: 'DataField',
  group: 'Layout',
  docs: "One fact, read: an overline naming it and the value under it. Not a `Field` - nothing here is editable, so there is no shell, no focus ring and no error state. The label is always the ramp's overline role, which is what stops six screens drifting to six label sizes.",
  usage: `<DataField.Root>
  <DataField.Label>Runtime</DataField.Label>
  <DataField.Value>2h 04m</DataField.Value>
</DataField.Root>

<DataField.Root>
  <DataField.Label>Network</DataField.Label>
  <DataField.Value lines={1}>{session.network}</DataField.Value>
</DataField.Root>`,
  guidelines: {
    do: [
      'Reach for `lines={1}` in a grid of readouts, so a long value truncates instead of widening its column.',
      'Let `size` come from the app (`setEntryDefaults`) and state it only where one readout is louder than its neighbours.',
    ],
    dont: [
      "Don't use it to label a control - that is `Field`, which owns the shell and the error.",
      "Don't put a sentence in the value; a readout is a fact, not a paragraph.",
    ],
  },
  matrix: false,
  component: DataField.Root,
  args: { size: 'md' as ControlSize },
  controls: { size: ['sm', 'md', 'tv'] },
  render: ({ size }) => (
    <DataField.Root size={size}>
      <DataField.Label>Runtime</DataField.Label>
      <DataField.Value>2h 04m</DataField.Value>
    </DataField.Root>
  ),
  scenes: [
    {
      name: 'A row of facts',
      docs: 'What a title screen and a library card both lay out: a wrapping row of readouts, each shrinking to its own column.',
      render: ({ size }) => (
        <Box row wrap gap={40}>
          <DataField.Root size={size}>
            <DataField.Label>Runtime</DataField.Label>
            <DataField.Value>2h 04m</DataField.Value>
          </DataField.Root>
          <DataField.Root size={size}>
            <DataField.Label>Released</DataField.Label>
            <DataField.Value>2017</DataField.Value>
          </DataField.Root>
          <DataField.Root size={size}>
            <DataField.Label>Audio</DataField.Label>
            <DataField.Value>English, French</DataField.Value>
          </DataField.Root>
          <DataField.Root size={size}>
            <DataField.Label>Subtitles</DataField.Label>
            <DataField.Value>None</DataField.Value>
          </DataField.Root>
        </Box>
      ),
    },
    {
      name: 'A value with its own shape',
      docs: 'What a plain string cannot say: a clamp, a hue, a chip beside the number.',
      render: ({ size }) => (
        <DataField.Root size={size}>
          <DataField.Label>Network</DataField.Label>
          <DataField.Value lines={1}>
            <Text color="success">Wi-Fi</Text> 192.168.1.42
          </DataField.Value>
        </DataField.Root>
      ),
    },
  ],
});
