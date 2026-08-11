import { story } from '@kroma/workbench/story';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { type KeyboardSize, keyVariants } from './key';
import { KEYBOARD_LAYOUTS } from './keyboard-layouts';
import { UrlKeyboard } from './url-keyboard';

// A component, not a `render` body: the value is state, and a hook in a
// render callback is a hook outside a component.
function UrlDemo({
  letters,
  size,
}: Readonly<{ letters: (typeof KEYBOARD_LAYOUTS)[number]; size?: KeyboardSize }>) {
  const [value, setValue] = useState('');
  return (
    <Box gap={16} style={{ alignSelf: 'stretch' }}>
      <Text variant="h2">{value || ' '}</Text>
      <UrlKeyboard
        value={value}
        onValueChange={setValue}
        onSubmit={() => undefined}
        submitLabel="Connecter"
        letters={letters}
        size={size}
      />
    </Box>
  );
}

export default story({
  name: 'UrlKeyboard',
  group: 'Input',
  docs: "The remote-driven server-URL grid: ten keys a row, the layout's letters plus the URL specials, and a clear / dot / submit tail row. Every key is a <Focusable>, so the spatial focus nav reaches it and OK activates it. **The letter order is the caller's**: a keyboard that read a settings store would tie the kit to one app's preferences, so the host passes `letters` (the TV reads its persisted device preference once per mount). Its sibling is `<SearchKeyboard>` - two components, not one with a `layout` switch.",
  usage: `<UrlKeyboard
  value={host}
  onValueChange={setHost}
  onSubmit={connect}
  submitLabel={t('connect.connect')}
  letters={getKeyboardLayoutPref()}
/>`,
  guidelines: {
    do: [
      'Own the value: the keyboard mutates it through `onValueChange` and holds nothing.',
      'Give `onSubmit` only where there is somewhere to submit to; without it the tail row is clear + dot.',
    ],
    dont: [
      "Don't render it beside a focusable the D-pad could wander into mid-word; give it the screen.",
      "Don't translate the letter rows: they are layouts, not copy.",
    ],
  },
  variants: keyVariants,
  args: { letters: 'abc' as (typeof KEYBOARD_LAYOUTS)[number] },
  controls: { letters: KEYBOARD_LAYOUTS },
  render: (props) => <UrlDemo {...props} />,
});
