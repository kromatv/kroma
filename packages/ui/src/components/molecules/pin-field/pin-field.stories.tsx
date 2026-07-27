import { story } from '@kroma/workbench/story';
import { PinField } from './pin-field';

export default story({
  name: 'PinField',
  group: 'Input',
  docs: "The fixed-length code entry, one dot per digit. Extracted from the TV's PIN screen: the dots, the buffer discipline and the hardware-keyboard capture live here; what a completed code **means** stays with the screen. With this preview focused, just type digits.",
  usage: `<PinField onComplete={(pin) => verify(pin)} physicalKeyboard={physicalKeyboard} />
<PinField length={6} value={code} onChange={setCode} error={rejected} />`,
  guidelines: {
    do: [
      'Submit from `onComplete`: a full code should validate with no OK press.',
      'On a TV, feed `onChange` from the on-screen Keypad; the dots are the same.',
    ],
    dont: ["Don't show what went wrong in the dots alone - pair `error` with a message."],
  },
  matrix: false,
  pad: 12,
  args: {
    length: 4,
    error: false,
    disabled: false,
    physicalKeyboard: true,
  },
  controls: { length: { min: 3, max: 8 } },
  render: (props) => <PinField {...props} key={String(props.length)} />,
  scenes: [
    {
      name: 'Rejected',
      docs: 'The empty dots go red while the message says why.',
      args: { error: true },
    },
  ],
});
