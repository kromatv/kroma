// <SearchKeyboard>: the remote-driven search grid - the layout's letters
// as-is, with space / backspace / close appended to the short tail row. Letters
// insert lowercase, since search is case-insensitive. Every key is a
// <Focusable>, so the spatial focus nav reaches it and OK activates it.
//
// The letter order is the CALLER's (a device preference on the TV, see its
// keyboardLayoutPref): a keyboard that read a store would tie the kit to one
// app's settings.

import {
  Key,
  type KeyboardSize,
  keyMetrics,
  keyRowWidth,
} from '#ui/components/organisms/keyboard/key';
import {
  type KeyboardLayout,
  LAYOUT_LETTER_ROWS,
} from '#ui/components/organisms/keyboard/keyboard-layouts';
import { usePhysicalTyping } from '#ui/components/organisms/keyboard/use-physical-typing';
import { FocusColumn, FocusRegion } from '#ui/lib/focus-scope';
import { useStableCallback } from '#ui/lib/stable-callback';
import { useTDefault } from '#ui/services/i18n';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

// A shared empty row, so a layout with no letters does not mint one per render.
const NO_ROW: readonly string[] = [];

// One fixed box for every key of every layout: the digits row always has TEN
// keys, so a flex-sized key made a letter in a six-key row nearly twice as
// wide as the digit above it. Rows are centred, so the short tail row reads
// as a deliberate shape instead of a ragged edge.
//
// The grid therefore declares that ten-key row's width (`keyRowWidth`) instead
// of taking the parent's: centred rows inside a narrower parent spill off both
// its edges. A screen laying out beside the keys reads the same function.

interface SearchKeyboardProps {
  value: string;
  onValueChange: (next: string) => void;
  onClose?: () => void;
  /** Letter order. Defaults to the alphabetical TV grid. */
  letters?: KeyboardLayout;
  /** Whether a real keyboard is attached, so typing bypasses the keys. Never
   *  true on a TV shell; a browser workbench passes it. */
  physicalKeyboard?: boolean;
  /** The key scale: `sm` for arm's length, `tv` for across a room. */
  size?: KeyboardSize;
}

/** The caller owns the text value; each key mutates it through
 * `onValueChange`, and space / delete / close call the matching handler. */
function SearchKeyboard({
  value,
  onValueChange,
  onClose,
  letters = 'abc',
  physicalKeyboard = false,
  size = 'sm',
}: Readonly<SearchKeyboardProps>) {
  usePhysicalTyping(value, onValueChange, physicalKeyboard);

  // The keyboard is kit chrome: it must not make <I18nProvider> a mount
  // requirement for every screen that shows a keyboard.
  const t = useTDefault();
  const m = keyMetrics(size);
  // Built per size, not at module scope: the box is the size's, and both grids
  // read it from the one table in ./key. A table rather than a helper per row:
  // a local function that builds an element is a new function every render, and
  // every key it makes is rebuilt with it.
  const s = {
    grid: { gap: m.gap, width: keyRowWidth(size), alignSelf: 'center' },
    row: { flexDirection: 'row', gap: m.gap, justifyContent: 'center' },
    key: { height: m.height, width: m.width, flexShrink: 0 },
    keyText: { fontSize: m.fontSize },
  } as const;
  const letterRows = LAYOUT_LETTER_ROWS[letters];
  const lastRow = letterRows.at(-1) ?? NO_ROW;
  // One handler for the whole grid, whose identity never moves: a closure over
  // `value` is rebuilt on every keystroke, and every key element with it.
  const type = useStableCallback((k: string) => onValueChange(value + k.toLowerCase()));
  const space = useStableCallback(() => onValueChange(`${value} `));
  const erase = useStableCallback(() => onValueChange(value.slice(0, -1)));
  const close = useStableCallback(() => onClose?.());
  return (
    // `grid`: keep the column when moving between rows, e.g. Down from T
    // reaches G, not wherever the next row was last left.
    <FocusColumn grid style={s.grid}>
      {/* <FocusRegion>, not a plain box: without declared rows, every key is a
          sibling in one flat list and Up/Down step through it diagonally. */}
      <FocusRegion style={s.row}>
        {DIGITS.map((d) => (
          <Key key={d} size={size} label={d} onPress={type} style={s.key} textStyle={s.keyText} />
        ))}
      </FocusRegion>
      {/* The screen opens on the first LETTER, not on the digit above it: a
          search starts with a word often enough that the digits row is the
          wrong place to hand the ring to. */}
      {letterRows.slice(0, -1).map((row, rowIndex) => (
        <FocusRegion key={row.join('')} style={s.row}>
          {row.map((l, at) => (
            <Key
              key={l}
              size={size}
              label={l}
              autoFocus={rowIndex === 0 && at === 0}
              onPress={type}
              style={s.key}
              textStyle={s.keyText}
            />
          ))}
        </FocusRegion>
      ))}
      <FocusRegion style={s.row}>
        {lastRow.map((l) => (
          <Key key={l} size={size} label={l} onPress={type} style={s.key} textStyle={s.keyText} />
        ))}
        {/* A glyph key draws no words, so its `label` is its accessible name
            alone - the same split <UrlKeyboard>'s delete key takes. */}
        <Key
          size={size}
          icon="space"
          iconSize={m.glyph}
          label={t('common.space')}
          onPress={space}
          style={s.key}
        />
        <Key
          size={size}
          icon="backspace"
          iconSize={m.glyph - 2}
          label={t('common.delete')}
          onPress={erase}
          style={s.key}
        />
        <Key
          size={size}
          icon="x"
          iconSize={m.glyph - 4}
          label={t('common.close')}
          onPress={close}
          style={s.key}
        />
      </FocusRegion>
    </FocusColumn>
  );
}

export type { SearchKeyboardProps };
export { SearchKeyboard };
