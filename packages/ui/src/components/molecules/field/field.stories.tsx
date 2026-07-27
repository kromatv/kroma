import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import type { TextFieldType } from '#ui/components/atoms/text-field';
import { Field } from './field';

const TYPES: TextFieldType[] = ['text', 'email', 'password', 'url', 'search', 'number'];

export default story({
  name: 'Field',
  group: 'Input',
  docs: 'THE text entry. There is no second input component to choose between - `<TextField>` exists behind this one as the control it renders, and is not exported, because a screen that reaches past the label also tends to lose the hint and the error. One `type` prop wires the platform correctly (keyboard, autofill, masking) and `password` grows its reveal eye. The rule the molecule enforces: an error **replaces** the help text instead of stacking below it, because two lines of small text under a field is the start of a broken form. On a television the entry renders the value plus a caret and the on-screen keyboard does the typing; where a real keyboard exists, `physicalKeyboard` makes it a live input.',
  usage: `<Field label="Email" type="email" icon="mail" onChange={setEmail} />

// A control that is not a text entry - the label, hint and error still apply:
<Field label="PIN" error={wrong ? 'Incorrect PIN' : undefined}>
  <PinField onComplete={verify} />
</Field>

// A bare entry (a header search box). The label is still required and still
// reaches the platform as the accessible name; only the label ROW is dropped.
<Field label="Search" hideLabel icon="search" onChange={setQuery}
       entry={{ h: 68, textStyle: { fontSize: 24 } }} />`,
  guidelines: {
    do: [
      'Let the Field render the entry: label, error tint and spacing stay in step.',
      'Pick a `type`; the keyboard and autofill follow from it.',
      'Pass `value` to own the state, or `defaultValue` to let the field run itself.',
      'Use `entry` for the entry’s own presentation (height, fill, type scale); box props on the Field lay out the field itself.',
    ],
    dont: [
      "Don't stack a hint under an error - the error takes the hint's place.",
      "Don't drop the `label` to hide it. `hideLabel` stops it being drawn and keeps it as the accessible name; an unnamed input is a bug on every platform.",
      "Don't reach for `keyboardType` directly - that's what `type` derives.",
    ],
  },
  matrix: false,
  // A field is as wide as the form around it. The range is the one that matters:
  // at the narrow end the hint has to wrap rather than push the entry out of
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
  // Uncontrolled with a remount key: the panel seeds the text, and typing in the
  // preview just works without the story holding state.
  render: ({ error, value, ...props }) => (
    <Field
      {...props}
      key={`${props.type}-${value}`}
      defaultValue={value}
      error={error || undefined}
      physicalKeyboard
    />
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
      name: 'Every type',
      docs: 'One prop decides the keyboard, the autofill hint and the masking. Flip `type` in the panel to compare; these are the six a client actually needs.',
      render: () => (
        <Box gap={18}>
          {TYPES.map((type) => (
            <Field
              key={type}
              label={type}
              type={type}
              defaultValue={type === 'password' ? 'hunter2' : ''}
              placeholder={type}
              physicalKeyboard
            />
          ))}
        </Box>
      ),
    },
  ],
});
