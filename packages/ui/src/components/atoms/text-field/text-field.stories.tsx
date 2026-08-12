import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Text } from '#ui/components/atoms/text';
import type { ControlSize } from '#ui/lib/field-shell';
import { TextField, type TextFieldType } from './text-field';

const TYPES: TextFieldType[] = ['text', 'email', 'password', 'url', 'search', 'number'];

const SIZES: ControlSize[] = ['sm', 'md', 'tv'];

export default story({
  name: 'TextField',
  group: 'Input',
  docs: "The single-line entry itself, under `<Field.Input>` and `<InputGroup.Input>`. It is not exported from the kit, because a screen that reaches past the label tends to lose the hint and the error with it; it has a story because the props those two forward are all its own. It is written **twice and reads once**: where a real keyboard exists it is a live `TextInput`, and on a television it is the value plus a caret with nothing focusable in it, so no press can summon the platform IME while the on-screen keyboard is doing the typing. Which one a shell gets is `setEntryDefaults`, once, at startup, and never a per-screen decision. The whole box is the caret's landing zone, so a press on the leading glyph or on the padding focuses the entry; the well's fill is translucent over a `<Frost>`, so a field on artwork reads as glass rather than as a hole; and `type` is the one prop that decides the keyboard, the autofill hint and the masking, with `password` growing its own reveal eye out of the layout so its padding cannot set the row height.",
  usage: `<Field.Root label="Server address">
  <Field.Input type="url" icon="server" value={address} onValueChange={setAddress} />
  <Field.Hint>The hostname or IP, with the port.</Field.Hint>
</Field.Root>

// The atom bare, which is for a caller drawing the shell around it:
<ButtonGroup.Root label="Server address">
  <TextField flex={1} minW={0} icon="world-search" placeholder="kroma.local:4040" />
  <Button label="Connect" />
</ButtonGroup.Root>`,
  guidelines: {
    do: [
      'Reach it through `<Field.Root>`: the label row, the hint, the error and the invalid tint come with it.',
      'Say what is being typed with `type`, and let the keyboard, the autofill and the masking follow from it.',
      'Pass `label` even where nothing draws it. It is the accessible name on every platform.',
      'Pair `readOnly` with `selectOnFocus` for a value that exists to be copied: the entry still focuses, and lands with the whole thing selected.',
      'Give it `flex={1} minW={0}` as a group member, so it takes the row and can still shrink.',
    ],
    dont: [
      "Don't import it for a form. Two spellings of one entry drift, and the label is not optional decoration.",
      "Don't set `physicalKeyboard` to patch one screen: it is a fact about the shell, and a television opening a native IME is the bug it exists to prevent.",
      "Don't hang a trailing control on a `password` field; the reveal eye is already sitting there.",
      "Don't set `keyboardType` or `autoComplete` by hand unless `type` derives the wrong one. A registration form's `new-password` is the case that does.",
    ],
  },
  matrix: false,
  width: { min: 300, max: 560 },
  args: {
    label: 'Server address',
    value: 'kroma.local:4040',
    placeholder: 'host:port',
    icon: 'server',
    type: 'text' as TextFieldType,
    size: 'md' as ControlSize,
    invalid: false,
    physicalKeyboard: true,
  },
  controls: { type: TYPES, icon: 'icon', size: SIZES },
  // Uncontrolled behind a remount key, so the panel can seed the text without
  // the story holding state.
  render: ({ label, value, placeholder, icon, type, size, invalid, physicalKeyboard }) => (
    <TextField
      key={`${type}-${size}-${value}`}
      label={label}
      defaultValue={value}
      placeholder={placeholder}
      icon={icon}
      type={type}
      size={size}
      invalid={invalid}
      physicalKeyboard={physicalKeyboard}
    />
  ),
  scenes: [
    {
      name: 'On a television',
      docs: 'The same field where there is no keyboard: a value, a caret and nothing that can take focus or be tapped into. The remote moves through the screen and the on-screen `<Keyboard>` writes into it, which is why the display is measured off the shell rather than off the `body` type role - the two spellings have to be the same height in the same form.',
      args: { physicalKeyboard: false, size: 'tv' },
    },
    {
      name: 'A control in the well',
      docs: '`trailing` puts a control inside the field, where the value it acts on is. The share link is read-only and selects itself on focus, so it can be picked up with the keyboard alone; the icon button beside it is the pointer road to the same thing. Where the extra thing belongs to the row rather than to the value, weld the two in a `<ButtonGroup>` instead.',
      example: () => (
        <TextField
          label="Invite link"
          defaultValue="https://kroma.tv/i/8f2ad1"
          icon="link"
          readOnly
          selectOnFocus
          physicalKeyboard
          trailing={
            <IconButton
              variant="ghost"
              diameter={30}
              glyph={16}
              icon="copy"
              label="Copy the link"
            />
          }
        />
      ),
    },
    {
      name: "Someone else's shell",
      docs: '`flat` drops the fill, the border, the corner, the frost and the focus ring, leaving the entry as text in a box somebody else drew. That somebody should be `<InputGroup>`, which owns the well, lights the whole assembly as one control and focuses the entry through `entryRef` when the shell itself is pressed. Hand-rolling the well, as below, gets the shape and none of that.',
      example: () => (
        <Box row align="center" gap={10} px={14} radius="md" bg="surface2" border="border">
          <Icon name="search" size={18} color="textDim" />
          <TextField flat flex={1} minW={0} label="Search" placeholder="Search" physicalKeyboard />
          <Text variant="meta" color="textDim">
            12 results
          </Text>
        </Box>
      ),
    },
  ],
});
