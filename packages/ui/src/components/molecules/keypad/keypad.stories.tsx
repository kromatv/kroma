import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { PinField } from '#ui/components/molecules/pin-field';
import { Keypad, keypadVariants } from './keypad';

function PinEntry() {
  const [code, setCode] = useState('');
  return (
    <Box align="center" gap={40}>
      <PinField value={code} onValueChange={setCode} />
      <Keypad
        autoFocus={false}
        onDigit={(d) => setCode((c) => (c.length < 4 ? c + d : c))}
        onDelete={() => setCode((c) => c.slice(0, -1))}
      />
    </Box>
  );
}

export default story({
  name: 'Keypad',
  group: 'Input',
  docs: "The remote's half of `<PinField>`: a phone dial the D-pad can walk without instructions. There is deliberately **no OK key**: the field completes itself on the last digit, so an OK would be a control that is never the right thing to press. The empty cell under the centre column is what keeps 0 where a hand expects it.",
  usage: `<PinField value={code} onValueChange={setCode} onComplete={submit} />
<Keypad onDigit={(d) => setCode(code + d)} onDelete={back} />`,
  guidelines: {
    do: ['Let it take the focus on mount; a PIN screen has nowhere else worth starting.'],
    dont: [
      "Don't add an OK key beside it - the code submits itself on the last digit.",
      "Don't use it where the platform has a real keyboard; that shell types into the field directly.",
    ],
  },
  variants: keypadVariants,
  omit: ['kind'],
  matrix: false,
  args: { autoFocus: false, disabled: false },
  render: (props) => <Keypad {...props} onDigit={() => {}} onDelete={() => {}} />,
  scenes: [
    {
      name: 'With the field',
      docs: 'The whole interaction: four dots, ten keys, no OK.',
      example: () => <PinEntry />,
    },
  ],
});
