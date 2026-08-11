import { story } from '@kroma/workbench/story';
import { OtpField } from './otp-field';
import { otpVariants } from './otp-field-variants';

export default story({
  name: 'OtpField',
  group: 'Input',
  usage: `<OtpField.Root maxLength={6} groups={[3, 3]} physicalKeyboard onComplete={verify} />

<OtpField.Root maxLength={6} physicalKeyboard onComplete={verify}>
  <OtpField.Group>
    <OtpField.Slot />
    <OtpField.Slot />
    <OtpField.Slot />
  </OtpField.Group>
  <OtpField.Separator />
  <OtpField.Group>
    <OtpField.Slot />
    <OtpField.Slot />
    <OtpField.Slot />
  </OtpField.Group>
</OtpField.Root>`,
  guidelines: {
    do: [
      'Submit from `onComplete`: a full code should verify with no OK press.',
      'Pass `physicalKeyboard` where a real keyboard exists; a TV keypad feeds `onValueChange` instead.',
      'Use `mask` for a secret PIN, or `PinField` when the design wants dots rather than slots.',
      'Pass `label`: with the entry off screen, it is the only accessible name the field has.',
    ],
    dont: [
      "Don't set a `pattern` the keyboard contradicts - `REGEXP_ONLY_DIGITS` and a text keypad fight each other.",
      "Don't leave `invalid` on after the user starts retyping; clear it in `onValueChange`.",
      "Don't put a separator inside a group: it would take a slot's place in the code.",
    ],
  },
  variants: otpVariants,
  omit: ['state'],
  matrix: false,
  args: {
    maxLength: 6,
    value: '123',
    mask: false,
    invalid: false as boolean,
    physicalKeyboard: true,
  },
  controls: { maxLength: { min: 3, max: 8 } },
  render: ({ value, ...props }) => (
    <OtpField.Root {...props} key={`${props.maxLength}-${value}`} defaultValue={value} />
  ),
  scenes: [
    {
      name: 'Grouped',
      docs: 'The sugar: `groups={[3, 3]}` is the classic six-digit code, one separator in the middle.',
      render: ({ value, ...props }) => (
        <OtpField.Root {...props} groups={[3, 3]} defaultValue={value} />
      ),
    },
    {
      name: 'Composed',
      docs: 'The same row written out of the parts. Delete the sugar and nothing is lost.',
      render: ({ value, ...props }) => (
        <OtpField.Root {...props} maxLength={6} defaultValue={value}>
          <OtpField.Group>
            <OtpField.Slot />
            <OtpField.Slot />
            <OtpField.Slot />
          </OtpField.Group>
          <OtpField.Separator />
          <OtpField.Group>
            <OtpField.Slot />
            <OtpField.Slot />
            <OtpField.Slot />
          </OtpField.Group>
        </OtpField.Root>
      ),
    },
    {
      name: 'Masked',
      docs: 'A secret PIN: the slots hold dots, and the value never renders.',
      args: { mask: true, maxLength: 4, value: '12' },
    },
    {
      name: 'Rejected',
      docs: 'Every slot keeps its red edge, including the one under the caret.',
      args: { invalid: true, value: '9999' },
    },
  ],
});
