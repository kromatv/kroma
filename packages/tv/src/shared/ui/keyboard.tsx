// The two remote-driven on-screen keyboards: a full layout for server URLs and a
// dedicated search layout (matching the KROMA design). Every key is a
// <Focusable>, so the spatial focus nav reaches it and OK activates it. Letter
// ordering follows the device's persisted layout preference (ABC / AZERTY /
// QWERTY / QWERTZ, see keyboardLayoutPref).

import {
  Button,
  colors,
  Focusable,
  FocusColumn,
  FocusRegion,
  Icon,
  type IconName,
  Txt,
  useHardwareKeys,
  webWindow,
} from '@kroma/ui/kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';
import { getKeyboardLayoutPref, type KeyboardLayoutPref } from '#tv/app/keyboardLayoutPref';
import { useEnv } from '#tv/app/providers/env';
import { LAYOUT_LETTER_ROWS, urlRows } from './keyboardLayouts';

// ----- physical-keyboard bridge -------------------------------------------------

/** On devices with a hardware keyboard (useEnv().physicalKeyboard: never a real
 * TV shell), let the user type straight into the value while the on-screen
 * keyboard is up, whatever element holds the spatial focus. The real text input
 * handles its own typing, so events targeting it are skipped; printable keys and
 * Backspace are consumed here (Space intentionally types a space instead of
 * activating the focused key: typing wins on keyboard devices). D-pad / Enter /
 * Escape stay with the focus nav.
 *
 * A DOM listener, which is exactly right: `physicalKeyboard` is only ever true
 * on a browser-based shell. The capability check keeps that explicit rather than
 * implied, so the native builds cannot trip over it. */
function usePhysicalTyping(value: string, onChange: (next: string) => void) {
  const { physicalKeyboard } = useEnv();
  const stateRef = useRef({ value, onChange });
  stateRef.current = { value, onChange };
  useEffect(() => {
    const w = physicalKeyboard ? webWindow() : null;
    if (!w) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      const s = stateRef.current;
      if (e.key === 'Backspace') {
        e.preventDefault();
        s.onChange(s.value.slice(0, -1));
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        s.onChange(s.value + e.key);
      }
    };
    w.addEventListener('keydown', onKey);
    return () => w.removeEventListener('keydown', onKey);
  }, [physicalKeyboard]);

  // The native half of the same idea. An Android TV takes a bluetooth keyboard
  // and the emulator has one; there is no `document` to listen to, so the
  // characters come from the remote bridge instead (a no-op on every browser
  // shell, where the listener above already has it covered). No capability
  // check: `physicalKeyboard` decides whether to render a typeable input INSTEAD
  // of this keyboard, which is not the question here - a keyboard someone
  // plugged into a television should just work, with the on-screen one still up
  // for the remote.
  useHardwareKeys(
    useCallback((key: string) => {
      const s = stateRef.current;
      if (key === 'Backspace') s.onChange(s.value.slice(0, -1));
      else if (key.length === 1) s.onChange(s.value + key);
    }, []),
  );
}

// ----- layout preference ------------------------------------------------------

/** The device's layout preference mapped through `derive`, computed ONCE per
 * mount. Both keyboards re-render on EVERY keystroke, and reading the stored
 * preference is a blocking cross-process hop on the old TV webviews, so neither
 * the read nor the row building it feeds may sit in the render body. Changing the
 * layout still lands: its picker is a screen of its own (the profile menu), so
 * the keyboard is unmounted while it happens and the next mount reads the new
 * value. `derive` must be a module-level (stable) function. */
function useLayout<T>(derive: (layout: KeyboardLayoutPref) => T): T {
  const [layout] = useState(getKeyboardLayoutPref);
  return useMemo(() => derive(layout), [derive, layout]);
}

// ----- shared key -------------------------------------------------------------

const KEY_FACE = { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 16 } as const;

/** One keyboard key. `focusFill` is what the focused key becomes: the URL
 * keyboard tints amber, the search keyboard fills solid for a stronger 10-foot
 * cue at its larger size. */
function Key({
  label,
  icon,
  iconSize,
  onPress,
  style,
  textStyle,
  focusFill,
  focusInk,
  autoFocus,
}: Readonly<{
  label?: string;
  icon?: IconName;
  iconSize?: number;
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  focusFill: string;
  focusInk: string;
  /** Marks this key the screen's focus entry point. */
  autoFocus?: boolean;
}>) {
  return (
    <Focusable
      onPress={onPress}
      label={label}
      autoFocus={autoFocus}
      focusScale={1.08}
      ring={false}
      style={[KEY_FACE, { alignItems: 'center', justifyContent: 'center' }, style]}
      focusedStyle={{ backgroundColor: focusFill }}
    >
      {({ focused }) =>
        icon ? (
          <Icon
            name={icon}
            size={iconSize ?? 24}
            stroke={1.8}
            color={focused ? focusInk : 'text'}
          />
        ) : (
          <Txt style={[{ fontWeight: '700' }, textStyle]} color={focused ? focusInk : 'text'}>
            {label}
          </Txt>
        )
      }
    </Focusable>
  );
}

/** A remote-driven on-screen keyboard. The caller owns the text value; each key
 * mutates it through `onChange`, and the special keys (space / delete / clear /
 * submit / close) call the matching handler. `layout` swaps between the
 * server-URL keyboard ({@link UrlKeyboard}) and the search keyboard (which has
 * its own dedicated design, {@link SearchKeyboard}). */
export function OnScreenKeyboard({
  value,
  onChange,
  onSubmit,
  onClose,
  layout = 'search',
  submitLabel,
}: Readonly<{
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  onClose?: () => void;
  layout?: 'url' | 'search';
  submitLabel?: string;
}>) {
  usePhysicalTyping(value, onChange);

  return layout === 'search' ? (
    <SearchKeyboard value={value} onChange={onChange} onClose={onClose} />
  ) : (
    <UrlKeyboard value={value} onChange={onChange} onSubmit={onSubmit} submitLabel={submitLabel} />
  );
}

const URL_FOCUS_FILL = 'rgba(244, 182, 66, 0.18)';
// Module scope, not the render body: this keyboard re-renders on every keystroke
// and hands these to ~40 keys, so rebuilding them would hand every key a new
// style identity each time (see useLayout's note above).
const URL_KEY: ViewStyle = { height: 52, flex: 1 };
const URL_KEY_TEXT: TextStyle = { fontSize: 20 };
const URL_CLEAR_KEY: ViewStyle = { height: 52, flex: 2 };
const URL_CLEAR_TEXT: TextStyle = { fontSize: 16 };
const URL_SUBMIT: ViewStyle = { height: 52, flex: 3 };

const KEY_ROW = { flexDirection: 'row' as const, gap: 12 };

/** The server-URL keyboard: a digit row, the preferred layout's letters as rows
 * of ten lowercase keys with the URL specials appended, then clear / "." / the
 * optional submit button. */
function UrlKeyboard({
  value,
  onChange,
  onSubmit,
  submitLabel,
}: Readonly<{
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  submitLabel?: string;
}>) {
  const rows = useLayout(urlRows);
  const press = (k: string) => {
    if (k === '⌫') onChange(value.slice(0, -1));
    else onChange(value + k);
  };
  return (
    // `grid`: Down from a key lands on the key BELOW it, not on wherever the next
    // row was last left. Same reason as the search keyboard.
    <FocusColumn grid style={{ gap: 12 }}>
      {rows.map((row, rowIndex) => (
        <FocusRegion key={row.join('')} style={KEY_ROW}>
          {row.map((k, keyIndex) => (
            <Key
              key={k}
              label={k}
              // Entry point of every screen built on the keyboard: its first key.
              autoFocus={rowIndex === 0 && keyIndex === 0}
              onPress={() => press(k)}
              style={URL_KEY}
              textStyle={URL_KEY_TEXT}
              focusFill={URL_FOCUS_FILL}
              focusInk="accent"
            />
          ))}
        </FocusRegion>
      ))}
      {/* A row, and it has to SAY so: as a plain box its three controls were
          siblings of the vertical column, so Left and Right did nothing between
          them and the submit button could only be reached by pressing Down past
          it. */}
      <FocusRegion style={KEY_ROW}>
        <Key
          label="⌧"
          onPress={() => onChange('')}
          style={URL_CLEAR_KEY}
          textStyle={URL_CLEAR_TEXT}
          focusFill={URL_FOCUS_FILL}
          focusInk="accent"
        />
        <Key
          label="."
          onPress={() => onChange(`${value}.`)}
          style={URL_KEY}
          textStyle={URL_KEY_TEXT}
          focusFill={URL_FOCUS_FILL}
          focusInk="accent"
        />
        {onSubmit ? (
          <Button variant="primary" onPress={onSubmit} label={submitLabel} style={URL_SUBMIT} />
        ) : null}
      </FocusRegion>
    </FocusColumn>
  );
}

// ----- search keyboard --------------------------------------------------------

const SEARCH_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/** Everything the search keyboard's look derives from a layout's letter rows.
 * Typewriter layouts run ten keys per row; in the 520px column that only reads
 * as a keyboard with uniform fixed near-square keys and centred rows (the
 * natural stagger). Stretchy flexible keys would give every row a different key
 * width. The ABC grid keeps the original roomy 6-column design. Built once per
 * mount (see {@link useLayout}), never per keystroke. */
function searchLook(layout: KeyboardLayoutPref) {
  const letterRows = LAYOUT_LETTER_ROWS[layout];
  const wide = letterRows.some((r) => r.length > 6);
  return {
    letterRows,
    lastRow: letterRows.at(-1) ?? [],
    wide,
    face: wide ? { height: 48, width: 44, flexShrink: 0 } : { height: 56, flex: 1 },
    text: { fontSize: wide ? 19 : 22 },
    rowGap: wide ? 8 : 12,
    // The three trailing-row glyphs are optically balanced against each other,
    // so they are sized together here rather than each at its own call site.
    icon: wide ? { space: 24, back: 22, close: 20 } : { space: 28, back: 26, close: 24 },
  };
}

/** The search on-screen keyboard, matching the KROMA design: a 1-0 digit row,
 * the uppercase alphabet in the preferred layout's rows, and a final row pairing
 * the layout's trailing letters with space, backspace and a close key. Letters
 * insert lowercase (search is case-insensitive); the focused key fills solid
 * amber for a strong 10-foot cue. */
function SearchKeyboard({
  value,
  onChange,
  onClose,
}: Readonly<{ value: string; onChange: (next: string) => void; onClose?: () => void }>) {
  const { letterRows, lastRow, wide, face, text, rowGap, icon } = useLayout(searchLook);
  const key = (id: string, label: string, onPress: () => void) => (
    <Key
      key={id}
      label={label}
      onPress={onPress}
      style={face}
      textStyle={text}
      focusFill={colors.accent}
      focusInk="accentInk"
    />
  );
  const glyph = (id: string, icon: IconName, size: number, onPress: () => void) => (
    <Key
      key={id}
      icon={icon}
      iconSize={size}
      onPress={onPress}
      style={face}
      focusFill={colors.accent}
      focusInk="accentInk"
    />
  );
  const letter = (l: string) => key(l, l, () => onChange(value + l.toLowerCase()));
  // A <FocusRegion>, not a <Box row>. A plain box is a layout and nothing else:
  // the keys inside it end up siblings of every other key on the keyboard, one
  // flat list in the order they mounted, so Up and Down stepped along that list
  // and the ring appeared to move diagonally. (The URL keyboard next door always
  // did declare its rows, which is why only this one felt broken.)
  const row = (children: React.ReactNode, id: string) => (
    <FocusRegion
      key={id}
      style={{
        flexDirection: 'row',
        gap: rowGap,
        justifyContent: wide ? 'center' : undefined,
      }}
    >
      {children}
    </FocusRegion>
  );
  return (
    // `grid`: keep the COLUMN when moving between rows. Without it the navigator
    // lands on whichever key the next row was last left on, which on a keyboard
    // is the difference between Down from T reaching G and reaching A.
    <FocusColumn grid style={{ gap: rowGap }}>
      {row(
        SEARCH_DIGITS.map((d) => key(d, d, () => onChange(value + d))),
        'digits',
      )}
      {letterRows.slice(0, -1).map((r) => row(r.map(letter), r.join('')))}
      {row(
        <>
          {lastRow.map(letter)}
          {glyph('space', 'space', icon.space, () => onChange(`${value} `))}
          {glyph('delete', 'backspace', icon.back, () => onChange(value.slice(0, -1)))}
          {glyph('close', 'x', icon.close, () => onClose?.())}
        </>,
        'last',
      )}
    </FocusColumn>
  );
}
