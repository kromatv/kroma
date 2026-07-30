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

// On a hardware keyboard (`physicalKeyboard`, never a real TV shell), typing
// wins over D-pad activation: Space types a space rather than pressing the
// focused key, and a real text input's own events are left alone.
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

  // Native half of the same idea: an Android TV/emulator bluetooth keyboard has
  // no `document` to listen to, so characters come from the remote bridge
  // instead (a no-op on browser shells, already covered above).
  useHardwareKeys(
    useCallback((key: string) => {
      const s = stateRef.current;
      if (key === 'Backspace') s.onChange(s.value.slice(0, -1));
      else if (key.length === 1) s.onChange(s.value + key);
    }, []),
  );
}

// Reads the layout preference once per mount, not per render: both keyboards
// re-render on every keystroke, and the read is a blocking cross-process hop
// on old TV webviews. The layout picker is a separate screen, so a changed
// value still lands on the keyboard's next mount.
function useLayout<T>(derive: (layout: KeyboardLayoutPref) => T): T {
  const [layout] = useState(getKeyboardLayoutPref);
  return useMemo(() => derive(layout), [derive, layout]);
}

const KEY_FACE = { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 16 } as const;

// `focusFill` is what the focused key becomes: the URL keyboard tints amber,
// the search keyboard fills solid for a stronger 10-foot cue at its larger size.
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

/** The caller owns the text value; each key mutates it through `onChange`, and
 * the special keys (space / delete / clear / submit / close) call the matching
 * handler. `layout` swaps between the server-URL and search keyboards. */
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
// Module scope, not the render body: this hands the same style identity to
// ~40 keys on every keystroke instead of rebuilding it each time.
const URL_KEY: ViewStyle = { height: 52, flex: 1 };
const URL_KEY_TEXT: TextStyle = { fontSize: 20 };
const URL_CLEAR_KEY: ViewStyle = { height: 52, flex: 2 };
const URL_CLEAR_TEXT: TextStyle = { fontSize: 16 };
const URL_SUBMIT: ViewStyle = { height: 52, flex: 3 };

const KEY_ROW = { flexDirection: 'row' as const, gap: 12 };

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
    // `grid`: Down from a key lands on the key below it, not wherever the next
    // row was last left.
    <FocusColumn grid style={{ gap: 12 }}>
      {rows.map((row, rowIndex) => (
        <FocusRegion key={row.join('')} style={KEY_ROW}>
          {row.map((k, keyIndex) => (
            <Key
              key={k}
              label={k}
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
      {/* Declared as a row: a plain box would make Left/Right do nothing
          between these three controls. */}
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

const SEARCH_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

// Typewriter layouts (10 keys/row) get fixed near-square keys so the column
// stays uniform; the ABC grid keeps its original roomy 6-column flex layout.
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

// Letters insert lowercase: search is case-insensitive.
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
  // <FocusRegion>, not a plain box: without declared rows, every key is a
  // sibling in one flat list and Up/Down step through it diagonally.
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
    // `grid`: keep the column when moving between rows, e.g. Down from T
    // reaches G, not wherever the next row was last left.
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
