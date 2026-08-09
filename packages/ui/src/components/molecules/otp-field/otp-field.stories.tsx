import { story } from '@kroma/workbench/story';
import { OtpField, type OtpSize } from './otp-field';

export default story({
  name: 'OtpField',
  group: 'Input',
  docs: "The one-time-code entry: a row of character slots with the caret on the next empty one. It replaces the web client's `input-otp` wrapper, which was a hidden DOM `<input>` and therefore could never run on a television. Here one off-screen entry owns the text - so paste, SMS autofill and typing all still work - while the slots are ordinary views. The API mirrors shadcn's **InputOTP** (`maxLength`, `pattern`, `onComplete`), and `groups={[3, 3]}` is how the separator is spelled.\n\nThe caret blinks only while that entry holds focus, so a form stacking three codes (current PIN, new, confirm) shows one caret rather than three. Click a row below to give it the focus and watch the caret appear.",
  usage: `<OtpField maxLength={6} groups={[3, 3]} physicalKeyboard onComplete={verify} />
<OtpField maxLength={4} mask pattern={REGEXP_ONLY_DIGITS} onChange={setPin} />`,
  guidelines: {
    do: [
      'Submit from `onComplete`: a full code should verify with no OK press.',
      'Pass `physicalKeyboard` where a real keyboard exists; a TV keypad feeds `onChange` instead.',
      'Use `mask` for a secret PIN, or `PinField` when the design wants dots rather than slots.',
      'Pass `label`: with the entry off screen, it is the only accessible name the field has.',
    ],
    dont: [
      "Don't set a `pattern` the keyboard contradicts - `REGEXP_ONLY_DIGITS` and a text keypad fight each other.",
      "Don't leave `invalid` on after the user starts retyping; clear it in `onChange`.",
    ],
  },
  // Not wired to `otpVariants`: those describe one slot's states, derived from
  // the value rather than passed in, so they are not part of the API.
  matrix: false,
  args: {
    maxLength: 6,
    value: '123',
    size: 'md' as OtpSize,
    mask: false,
    invalid: false as boolean,
    disabled: false,
    physicalKeyboard: true,
  },
  controls: { maxLength: { min: 3, max: 8 }, size: ['md', 'tv'] },
  render: ({ value, ...props }) => (
    <OtpField {...props} key={`${props.maxLength}-${value}`} defaultValue={value} />
  ),
  scenes: [
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
