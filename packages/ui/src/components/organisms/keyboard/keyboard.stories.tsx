import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { OnScreenKeyboard } from './keyboard';
import { KEYBOARD_LAYOUTS } from './keyboard-layouts';

// A component, not a `render` body: the value is state, and a hook in a
// render callback is a hook outside a component.
function KeyboardDemo({
  layout,
  letters,
}: Readonly<{ layout: 'url' | 'search'; letters: (typeof KEYBOARD_LAYOUTS)[number] }>) {
  const [value, setValue] = useState('');
  return (
    <Box gap={16} style={{ alignSelf: 'stretch' }}>
      <Txt variant="h2">{value || ' '}</Txt>
      <OnScreenKeyboard
        value={value}
        onChange={setValue}
        onSubmit={() => undefined}
        submitLabel="Connecter"
        layout={layout}
        letters={letters}
      />
    </Box>
  );
}

export default story({
  name: 'OnScreenKeyboard',
  group: 'Input',
  docs: "The remote-driven keyboard, in two grids: `search` (letters as-is, with space / backspace / close on the short tail row) and `url` (ten keys a row, URL specials, a submit button). Every key is a <Focusable>, so the spatial focus nav reaches it and OK activates it. **The letter order is the caller's**: a keyboard that read a settings store would tie the kit to one app's preferences, so the host passes `letters` (the TV reads its persisted device preference once per mount).",
  usage: `<OnScreenKeyboard
  value={query}
  onChange={setQuery}
  onClose={back}
  layout="search"
  letters={getKeyboardLayoutPref()}
/>`,
  guidelines: {
    do: [
      'Own the value: the keyboard mutates it through `onChange` and holds nothing.',
      'Pass `physicalKeyboard` where a real keyboard can be attached, so typing bypasses the keys instead of pressing the focused one.',
    ],
    dont: [
      "Don't render it beside a focusable the D-pad could wander into mid-word; give it the screen.",
      "Don't translate the letter rows: they are layouts, not copy.",
    ],
  },
  args: {
    layout: 'search' as 'search' | 'url',
    letters: 'abc' as (typeof KEYBOARD_LAYOUTS)[number],
  },
  controls: {
    layout: ['search', 'url'],
    letters: KEYBOARD_LAYOUTS,
  },
  render: ({ layout, letters }) => <KeyboardDemo layout={layout} letters={letters} />,
});
