import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import type { TextFieldType } from '#ui/components/atoms/text-field';
import { Select } from '#ui/components/molecules/select';
import { Field } from './field';

const TYPES: TextFieldType[] = ['text', 'email', 'password', 'url', 'search', 'number'];

export default story({
  name: 'Field',
  group: 'Input',
  docs: 'THE text entry. There is no second input component to choose between - `<TextField>` and `<TextArea>` exist behind `Field.Input` and `Field.Textarea` as the controls they render, and are not exported, because a screen that reaches past the label also tends to lose the hint and the error. The **Root** owns the label, the shell size, the value and the invalid presentation; the parts read all four through context. Multi-line is a different PART, not a boolean. `type` wires the platform correctly (keyboard, autofill, masking) and `password` grows its reveal eye. The rule the molecule enforces: an error **replaces** the help text instead of stacking below it, because two lines of small text under a field is the start of a broken form. On a television the entry renders the value plus a caret and the on-screen keyboard does the typing; where a real keyboard exists, `physicalKeyboard` makes it a live input.',
  usage: `<Field.Root label="Server address" hint="The hostname or IP, with the port.">
  <Field.Input type="url" icon="server" value={address} onValueChange={setAddress} />
</Field.Root>

// The common case is one line: with no children the Root renders the entry,
// and \`hint\` renders the note.
<Field.Root label="Name" value={name} onValueChange={setName} />

// Multi-line is a part, not a flag:
<Field.Root label="Notes">
  <Field.Textarea rows={4} value={notes} onValueChange={setNotes} />
</Field.Root>

// A control that is not a text entry - the label, hint and error still apply:
<Field.Root label="PIN" error={wrong ? 'Incorrect PIN' : undefined}>
  <PinField onComplete={verify} />
</Field.Root>

// A bare entry (a header search box). The label is still required and still
// reaches the platform as the accessible name; only the label ROW is dropped.
<Field.Root label="Search" hideLabel size="tv">
  <Field.Input type="search" icon="search" onValueChange={setQuery} />
</Field.Root>`,
  guidelines: {
    do: [
      'Let the Root render the entry: label, error tint and spacing stay in step.',
      'Pick a `type` on the entry; the keyboard and autofill follow from it.',
      'Pass `value` to own the state, or `defaultValue` to let the field run itself.',
      'Put the entry’s own presentation (height, fill, type scale) on `Field.Input`; box props on `Field.Root` lay out the field itself.',
    ],
    dont: [
      "Don't stack a hint under an error - the error takes the hint's place.",
      "Don't drop the `label` to hide it. `hideLabel` stops it being drawn and keeps it as the accessible name; an unnamed input is a bug on every platform.",
      "Don't reach for `keyboardType` directly - that's what `type` derives.",
      "Don't set `size` on a part: the Root owns the shell, so a form stays one family.",
    ],
  },
  matrix: false,
  // At the narrow end the hint has to wrap rather than push the entry out of
  // shape, and the reveal eye has to stay off the text.
  width: { min: 280, max: 560 },
  args: {
    label: 'Server address',
    hint: 'The hostname or IP, with the port.',
    error: '',
    type: 'text' as TextFieldType,
    value: 'kroma.local:4040',
    placeholder: '',
    icon: 'server',
    hideLabel: false,
  },
  controls: { type: TYPES, icon: 'icon' },
  // Uncontrolled with a remount key, so the panel can seed the text without the
  // story holding state.
  render: ({ label, hint, error, type, value, placeholder, icon, hideLabel }) => (
    <Field.Root
      key={`${type}-${value}`}
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error || undefined}
    >
      <Field.Input
        type={type}
        icon={icon}
        placeholder={placeholder}
        defaultValue={value}
        physicalKeyboard
      />
    </Field.Root>
  ),
  scenes: [
    {
      name: 'With error',
      docs: 'The error takes the hint’s place and paints the entry’s border, rather than adding a second line under it.',
      args: { error: 'The server did not answer.', hint: '' },
    },
    {
      name: 'Password',
      docs: 'The reveal eye is part of the `type`, not something a screen wires.',
      args: { label: 'Password', type: 'password', value: 'hunter2', hint: '', icon: 'lock' },
    },
    {
      name: 'No label row',
      docs: 'What the 10-foot search boxes and the workbench’s own filter use, and the case that used to justify exporting the raw control. `hideLabel` drops the label ROW only - the input is still named for VoiceOver and for the browser.',
      args: {
        label: 'Search',
        hideLabel: true,
        icon: 'search',
        type: 'search',
        value: '',
        placeholder: 'Search',
        hint: '',
      },
    },
    {
      name: 'Multi-line',
      docs: 'A paragraph is its own part: `<Field.Textarea>` opens `rows` tall and GROWS with what is typed into it, up to `maxRows`, past which it scrolls rather than pushing the rest of the form off the screen. One line of it is one line of a single-line field, so the two align in a form. On a television it is the same display-plus-caret the single-line entry uses.',
      render: () => (
        <Box gap={18}>
          <Field.Root label="Message" hint="Grows as you type, up to ten lines.">
            <Field.Textarea rows={3} placeholder="The server restarts at nine." physicalKeyboard />
          </Field.Root>
          <Field.Root label="Reason" error="Say why the request was refused.">
            <Field.Textarea rows={2} physicalKeyboard />
          </Field.Root>
        </Box>
      ),
    },
    {
      name: 'Around another control',
      docs: 'Give the Root a control of your own and it keeps the label, hint and error - which is how a `<Select>` gets the same label row as the entry beside it. Wrap it: a bare `block` select dropped into a grid cell is stretched by whatever is tallest in the row, and arrives taller than the field next to it. Wrapped, both cells are a label over a control off the same shell table, so they line up on both edges.',
      render: () => (
        <Box row gap={14}>
          <Box flex>
            <Field.Root label="Category">
              <Select.Root label="Category" defaultValue="system">
                <Select.Trigger block />
                <Select.Item value="system">Server status</Select.Item>
                <Select.Item value="media">New media</Select.Item>
                <Select.Item value="request">Requests</Select.Item>
              </Select.Root>
            </Field.Root>
          </Box>
          <Box flex>
            <Field.Root label="Opens">
              <Field.Input placeholder="/movie/…" icon="link" physicalKeyboard />
            </Field.Root>
          </Box>
        </Box>
      ),
    },
    {
      name: 'Every type',
      docs: 'One prop decides the keyboard, the autofill hint and the masking. Flip `type` in the panel to compare; these are the six a client actually needs.',
      render: () => (
        <Box gap={18}>
          {TYPES.map((type) => (
            <Field.Root key={type} label={type}>
              <Field.Input
                type={type}
                defaultValue={type === 'password' ? 'hunter2' : ''}
                placeholder={type}
                physicalKeyboard
              />
            </Field.Root>
          ))}
        </Box>
      ),
    },
  ],
});
