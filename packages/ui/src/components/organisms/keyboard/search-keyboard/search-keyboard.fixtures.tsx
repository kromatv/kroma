import { useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

import type { KeyboardSize } from '../key';

import type { KEYBOARD_LAYOUTS } from '../keyboard-layouts';

import { SearchKeyboard } from './search-keyboard';

export // A component, not a `render` body: the value is state, and a hook in a
// render callback is a hook outside a component.
function SearchDemo({
  letters,
  size,
}: Readonly<{ letters: (typeof KEYBOARD_LAYOUTS)[number]; size?: KeyboardSize }>) {
  const [value, setValue] = useState('');
  return (
    <Box gap={16} style={{ alignSelf: 'stretch' }}>
      <Text variant="h2">{value || ' '}</Text>
      <SearchKeyboard value={value} onValueChange={setValue} letters={letters} size={size} />
    </Box>
  );
}
