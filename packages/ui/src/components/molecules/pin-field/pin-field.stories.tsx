import { story } from '@kroma/workbench/story';
import { PinField } from './pin-field';

export default story({
  name: 'PinField',
  group: 'Input',
  docs: 'The fixed-length code entry, one dot per digit. It is `<OtpField>` wearing another face: the same Root holds the code, and each dot is an `<OtpField.Group>` child reading `useOtpSlot()`. What is its own is the capture - a television cannot mount the off-screen entry `<OtpField>` types into, because a focused text input summons the platform keyboard over the screen, so a hardware keyboard is read window-wide instead. With this preview focused, just type digits.',
  usage: `<PinField onComplete={(pin) => verify(pin)} physicalKeyboard={physicalKeyboard} />
<PinField maxLength={6} value={code} onValueChange={setCode} invalid={rejected} />`,
  guidelines: {
    do: [
      'Submit from `onComplete`: a full code should validate with no OK press.',
      'On a TV, feed `onValueChange` from the on-screen Keypad; the dots are the same.',
      'Reach for `<OtpField>` instead wherever the design wants slots and a caret.',
    ],
    dont: ["Don't show what went wrong in the dots alone - pair `invalid` with a message."],
  },
  matrix: false,
  pad: 12,
  args: {
    maxLength: 4,
    invalid: false,
    disabled: false,
    physicalKeyboard: true,
  },
  controls: { maxLength: { min: 3, max: 8 } },
  render: (props) => <PinField {...props} key={String(props.maxLength)} />,
  scenes: [
    {
      name: 'Rejected',
      docs: 'The empty dots go red while the message says why.',
      args: { invalid: true },
    },
  ],
});
