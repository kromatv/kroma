import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { KEYBOARD_LAYOUTS } from './keyboard-layouts';
import { SearchKeyboard } from './search-keyboard';

// A component, not a `render` body: the value is state, and a hook in a
// render callback is a hook outside a component.
function SearchDemo({ letters }: Readonly<{ letters: (typeof KEYBOARD_LAYOUTS)[number] }>) {
  const [value, setValue] = useState('');
  return (
    <Box gap={16} style={{ alignSelf: 'stretch' }}>
      <Text variant="h2">{value || ' '}</Text>
      <SearchKeyboard value={value} onValueChange={setValue} letters={letters} />
    </Box>
  );
}

export default story({
  name: 'SearchKeyboard',
  group: 'Input',
  docs: "The remote-driven search grid: the layout's letters as-is, with space / backspace / close on the short tail row, and a digits row above them. Letters insert lowercase, since search is case-insensitive. Every key is a <Focusable>, so the spatial focus nav reaches it and OK activates it. **The letter order is the caller's**: a keyboard that read a settings store would tie the kit to one app's preferences, so the host passes `letters` (the TV reads its persisted device preference once per mount). Its sibling is `<UrlKeyboard>` - two components, not one with a `layout` switch.",
  usage: `<SearchKeyboard
  value={query}
  onValueChange={setQuery}
  onClose={back}
  letters={getKeyboardLayoutPref()}
/>`,
  guidelines: {
    do: [
      'Own the value: the keyboard mutates it through `onValueChange` and holds nothing.',
      'Pass `physicalKeyboard` where a real keyboard can be attached, so typing bypasses the keys instead of pressing the focused one.',
    ],
    dont: [
      "Don't render it beside a focusable the D-pad could wander into mid-word; give it the screen.",
      "Don't translate the letter rows: they are layouts, not copy.",
    ],
  },
  args: { letters: 'abc' as (typeof KEYBOARD_LAYOUTS)[number] },
  controls: { letters: KEYBOARD_LAYOUTS },
  render: ({ letters }) => <SearchDemo letters={letters} />,
});
