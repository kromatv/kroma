import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import type { ControlSize } from '#ui/lib/field-shell';
import { DataField } from './data-field';

export default story({
  name: 'DataField',
  group: 'Layout',
  docs: "One fact, read: an overline naming it and the value under it. Not a `Field` - nothing here is editable, so there is no shell, no focus ring and no error state. The label is always the ramp's overline role, which is what stops six screens drifting to six label sizes.",
  usage: `<DataField.Root label="Duree" value="2 h 04" />

<DataField.Root label="Reseau">
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
  args: { size: 'md' as ControlSize, label: 'Duree', value: '2 h 04' },
  controls: { size: ['sm', 'md', 'tv'] },
  render: (props) => <DataField.Root {...props} />,
  scenes: [
    {
      name: 'A row of facts',
      docs: 'What a title screen and a library card both lay out: a wrapping row of readouts, each shrinking to its own column.',
      render: ({ size }) => (
        <Box row wrap gap={40}>
          <DataField.Root size={size} label="Duree" value="2 h 04" />
          <DataField.Root size={size} label="Sortie" value="2017" />
          <DataField.Root size={size} label="Audio" value="Francais, Anglais" />
          <DataField.Root size={size} label="Sous-titres" value="Aucun" />
        </Box>
      ),
    },
    {
      name: 'Composed',
      docs: 'The same pair written as its parts, which is what a value the sugar cannot express needs: a clamp, a hue, a chip beside the number.',
      render: ({ size }) => (
        <DataField.Root size={size}>
          <DataField.Label>Reseau</DataField.Label>
          <DataField.Value lines={1}>
            <Text color="success">Wi-Fi</Text> 192.168.1.42
          </DataField.Value>
        </DataField.Root>
      ),
    },
  ],
});
