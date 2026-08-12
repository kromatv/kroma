// <UrlKeyboard>: the remote-driven server-URL grid - ten keys a row, the
// layout's letters plus the URL specials, and a submit button on the tail row.
// Every key is a <Focusable>, so the spatial focus nav reaches it and OK
// activates it.
//
// The letter order is the CALLER's (a device preference on the TV, see its
// keyboardLayoutPref): a keyboard that read a store would tie the kit to one
// app's settings.

import { Button } from '#ui/components/atoms/button';
import { FocusColumn, FocusRegion } from '#ui/lib/focus-scope';
import { useTDefault } from '#ui/services/i18n';
import { Key, type KeyboardSize, keyMetrics, keyRowWidth } from '../key';
import { DELETE_KEY, type KeyboardLayout, urlRows } from '../keyboard-layouts';
import { usePhysicalTyping } from '../use-physical-typing';

interface UrlKeyboardProps {
  value: string;
  onValueChange: (next: string) => void;
  onSubmit?: () => void;
  submitLabel?: string;
  /** Letter order. Defaults to the alphabetical TV grid. */
  letters?: KeyboardLayout;
  /** Whether a real keyboard is attached, so typing bypasses the keys. Never
   *  true on a TV shell; a browser workbench passes it. */
  physicalKeyboard?: boolean;
  /** The key scale: `sm` for arm's length, `tv` for across a room. */
  size?: KeyboardSize;
}

/** The caller owns the text value; each key mutates it through
 * `onValueChange`, and clear / submit call the matching handler. */
function UrlKeyboard({
  value,
  onValueChange,
  onSubmit,
  submitLabel,
  letters = 'abc',
  physicalKeyboard = false,
  size = 'sm',
}: Readonly<UrlKeyboardProps>) {
  usePhysicalTyping(value, onValueChange, physicalKeyboard);

  const m = keyMetrics(size);
  // Built per size, not at module scope: the box is the size's, and both
  // grids read it from the one table in ./key.
  const s = {
    column: { gap: m.gap, width: keyRowWidth(size), alignSelf: 'center' },
    key: { height: m.height, flex: 1 },
    keyText: { fontSize: m.fontSize },
    clearKey: { height: m.height, flex: 2 },
    submit: { height: m.height, flex: 3 },
    keyRow: { flexDirection: 'row', gap: m.gap },
  } as const;
  // The keyboard is kit chrome: it must not make <I18nProvider> a mount
  // requirement for every screen that shows a keyboard.
  const t = useTDefault();
  const rows = urlRows(letters);
  const press = (k: string) => {
    if (k === DELETE_KEY) onValueChange(value.slice(0, -1));
    else onValueChange(value + k);
  };
  return (
    // `grid`: Down from a key lands on the key below it, not wherever the next
    // row was last left.
    <FocusColumn grid style={s.column}>
      {rows.map((row, rowIndex) => (
        <FocusRegion key={row.join('')} style={s.keyRow}>
          {row.map((k, keyIndex) => (
            <Key
              size={size}
              key={k}
              label={k === DELETE_KEY ? t('common.delete') : k}
              icon={k === DELETE_KEY ? 'backspace' : undefined}
              iconSize={m.glyph}
              autoFocus={rowIndex === 0 && keyIndex === 0}
              onPress={() => press(k)}
              style={s.key}
              textStyle={s.keyText}
            />
          ))}
        </FocusRegion>
      ))}
      {/* Declared as a row: a plain box would make Left/Right do nothing
          between these three controls. */}
      <FocusRegion style={s.keyRow}>
        {/* An icon, never a symbol character: TV system fonts miss glyphs like
            U+2327 and draw a tofu box instead. */}
        <Key
          size={size}
          label={t('common.clear')}
          icon="eraser"
          iconSize={m.glyph - 2}
          onPress={() => onValueChange('')}
          style={s.clearKey}
        />
        <Key
          size={size}
          label="."
          onPress={() => onValueChange(`${value}.`)}
          style={s.key}
          textStyle={s.keyText}
        />
        {onSubmit ? (
          <Button variant="primary" onPress={onSubmit} label={submitLabel} style={s.submit} />
        ) : null}
      </FocusRegion>
    </FocusColumn>
  );
}

export type { UrlKeyboardProps };
export { UrlKeyboard };
