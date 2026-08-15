import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { PinField } from '#ui/components/molecules/pin-field';

import { Keypad } from './keypad';

export function PinEntry() {
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
