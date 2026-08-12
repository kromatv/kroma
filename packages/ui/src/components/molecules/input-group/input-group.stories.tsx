import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';
import { InputGroup } from './input-group';

export default story({
  name: 'InputGroup',
  group: 'Input',
  docs: 'An entry with things welded into its shell: a glyph, a unit, a keyboard hint, a button. The Root owns the box, the border, the corner and the focus ring, and the entry inside it gives all four up, so the whole assembly lights as ONE control rather than a field with ornaments beside it. Reach for it when the addon belongs INSIDE the box; when the extra thing is a label, a hint or an error, that is `<Field>`, and the two compose.',
  usage: `<InputGroup.Root label="Search">
  <InputGroup.Addon>
    <Icon name="search" size={18} color="textDim" />
  </InputGroup.Addon>
  <InputGroup.Input placeholder="Search" />
  <InputGroup.Addon align="inline-end">
    <InputGroup.Text>12 results</InputGroup.Text>
  </InputGroup.Addon>
</InputGroup.Root>

// Inside a <Field>, which adds the label, the hint and the error:
<Field label="Amount" hint="Before tax.">
  <InputGroup.Root label="Amount">
    <InputGroup.Addon><InputGroup.Text>$</InputGroup.Text></InputGroup.Addon>
    <InputGroup.Input type="number" placeholder="0.00" />
  </InputGroup.Root>
</Field>`,
  guidelines: {
    do: [
      'Say where an addon goes with `align`, and write the parts in whatever order reads best: the Root sorts them.',
      'Put a button in an addon rather than beside the group, when the action belongs to the value being typed.',
      'Use the `block-*` addons with `InputGroup.Textarea`: they are bars across the entry, not chips beside it.',
      'Wrap the group in a `<Field>` for the label, hint and error; the group is the control, not the whole form row.',
    ],
    dont: [
      "Don't put two entries in one group. One shell is one value.",
      "Don't reach for it just to prefix an icon: `<Field icon>` already does that, with less to write.",
      "Don't wrap an addon in a layout view. The Root reads its DIRECT children to sort them, so a wrapped addon lands in the entry's bucket.",
    ],
  },
  matrix: false,
  width: { min: 300, max: 560 },
  args: { invalid: false },
  render: ({ invalid }) => (
    <InputGroup.Root label="Search" invalid={invalid}>
      <InputGroup.Addon>
        <Icon name="search" size={18} color="textDim" />
      </InputGroup.Addon>
      <InputGroup.Input placeholder="Search" physicalKeyboard />
      <InputGroup.Addon align="inline-end">
        <InputGroup.Text>12 results</InputGroup.Text>
      </InputGroup.Addon>
    </InputGroup.Root>
  ),
  scenes: [
    {
      name: 'Units',
      docs: 'A prefix and a suffix that are text rather than glyphs. The entry drops its own padding on whichever side an addon is already holding, so `$` sits where the caret would have, and the number starts right after it instead of a stop further in.',
      example: () => (
        <InputGroup.Root label="Amount">
          <InputGroup.Addon>
            <InputGroup.Text>$</InputGroup.Text>
          </InputGroup.Addon>
          <InputGroup.Input type="number" placeholder="0.00" physicalKeyboard />
          <InputGroup.Addon align="inline-end">
            <InputGroup.Text>USD</InputGroup.Text>
          </InputGroup.Addon>
        </InputGroup.Root>
      ),
    },
    {
      name: 'A button in the shell',
      docs: 'The action belongs to the value being typed, so it lives in the box with it. Neither button is a size someone picked: both are the shell height minus the inset, with the corner that leaves the two concentric, which is why they still look right when the shell is `md` on a television. `InputGroup.IconButton` is the icon-only one, whose `label` is the accessible name rather than visible text.',
      example: () => (
        <Box gap={16}>
          <InputGroup.Root label="Share link">
            <InputGroup.Input defaultValue="https://kroma.tv/invite/9f2a" physicalKeyboard />
            <InputGroup.Addon align="inline-end">
              <InputGroup.IconButton icon="copy" label="Copy" />
            </InputGroup.Addon>
          </InputGroup.Root>
          <InputGroup.Root label="Search the catalogue">
            <InputGroup.Addon>
              <Icon name="search" size={18} color="textDim" />
            </InputGroup.Addon>
            <InputGroup.Input placeholder="Blade Runner" physicalKeyboard />
            <InputGroup.Addon align="inline-end">
              <InputGroup.Button variant="primary" label="Search" />
            </InputGroup.Addon>
          </InputGroup.Root>
        </Box>
      ),
    },
    {
      name: 'A picker row',
      docs: "The composed shape the admin console uses for a pick-from-dialog value: a read-only entry naming the choice, the thumbnail as the leading addon, the action welded into the shell. On the console's dense `sm` shell, which is where tight insets show first.",
      example: () => (
        <Box gap={16}>
          <InputGroup.Root size="sm" label="Image">
            <InputGroup.Addon>
              <Icon name="photo" size={16} color="textDim" />
            </InputGroup.Addon>
            <InputGroup.Input readOnly placeholder="Choisir une image" physicalKeyboard />
            <InputGroup.Addon align="inline-end">
              <InputGroup.Button label="Choisir" />
            </InputGroup.Addon>
          </InputGroup.Root>
          <InputGroup.Root size="sm" label="Image">
            <InputGroup.Addon>
              <Icon name="photo" size={16} color="textDim" />
            </InputGroup.Addon>
            <InputGroup.Input readOnly defaultValue="notif-9f2a11c0-w1280.webp" physicalKeyboard />
            <InputGroup.Addon align="inline-end">
              <InputGroup.IconButton icon="x" label="Effacer" />
              <InputGroup.Button label="Choisir" />
            </InputGroup.Addon>
          </InputGroup.Root>
        </Box>
      ),
    },
    {
      name: 'A bar under the entry',
      docs: 'What `block-end` is for: a bar the width of the shell, under a paragraph rather than beside it. Written first or last in the JSX makes no difference, because `align` decides where it lands.',
      example: () => (
        <InputGroup.Root label="Comment">
          <InputGroup.Textarea rows={3} placeholder="Write a comment" physicalKeyboard />
          <InputGroup.Addon align="block-end" divider>
            <InputGroup.Text>0/280</InputGroup.Text>
            <Box flex />
            <InputGroup.Button variant="primary" label="Post" />
          </InputGroup.Addon>
        </InputGroup.Root>
      ),
    },
    {
      name: 'A bar on both edges',
      docs: 'The fullest shape: a header naming what is being edited, a footer holding the action, the entry between them. `divider` rules each bar off from the entry, which is the line that stops the whole thing reading as one undifferentiated box.',
      example: () => (
        <InputGroup.Root label="Script">
          <InputGroup.Addon align="block-start" divider>
            <Icon name="file-code" size={16} color="textDim" />
            <InputGroup.Text>script.js</InputGroup.Text>
            <Box flex />
            <InputGroup.Button icon="refresh" label="Reload" />
          </InputGroup.Addon>
          <InputGroup.Textarea rows={4} defaultValue="console.log('hello');" physicalKeyboard />
          <InputGroup.Addon align="block-end" divider>
            <InputGroup.Text>Line 1, Column 1</InputGroup.Text>
            <Box flex />
            <InputGroup.Button variant="primary" icon="player-play" label="Run" />
          </InputGroup.Addon>
        </InputGroup.Root>
      ),
    },
  ],
});
