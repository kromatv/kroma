// The two remote-driven on-screen keyboards: a full layout for server URLs and a
// dedicated search layout (matching the KROMA design). Every key is a
// <Focusable>, so the spatial focus nav reaches it and OK activates it. Letter
// ordering follows the device's persisted layout preference (ABC / AZERTY /
// QWERTY / QWERTZ, see keyboardLayoutPref).

import {
  Button,
  Focusable,
  FocusColumn,
  FocusRegion,
  Icon,
  type IconName,
  type IconProps,
  type StyleDecl,
  styles,
  svFor,
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
      const state = stateRef.current;
      if (e.key === 'Backspace') {
        e.preventDefault();
        state.onChange(state.value.slice(0, -1));
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        state.onChange(state.value + e.key);
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
      const state = stateRef.current;
      if (key === 'Backspace') state.onChange(state.value.slice(0, -1));
      else if (key.length === 1) state.onChange(state.value + key);
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

// The focused key: the URL keyboard tints amber, the search keyboard fills solid
// for a stronger 10-foot cue at its larger size.
const keyFace = svFor<{
  root: StyleDecl;
  glyph: Pick<IconProps, 'color' | 'stroke'>;
  label: StyleDecl;
}>()({
  slots: {
    root: { center: true, radius: 16, bg: 'white/5' },
    glyph: { color: 'text', stroke: 1.8 },
    label: { color: 'text' },
  },
  variants: {
    tone: {
      url: {
        root: { _focus: { bg: 'accent/18' } },
        glyph: { _focus: { color: 'accent' } },
        label: { _focus: { color: 'accent' } },
      },
      search: {
        root: { _focus: { bg: 'accent' } },
        glyph: { _focus: { color: 'accentInk' } },
        label: { _focus: { color: 'accentInk' } },
      },
    },
  },
});

type KeyTone = 'url' | 'search';

function Key({
  label,
  icon,
  iconSize,
  onPress,
  style,
  textStyle,
  tone,
  autoFocus,
}: Readonly<{
  label?: string;
  icon?: IconName;
  iconSize?: number;
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  tone: KeyTone;
  autoFocus?: boolean;
}>) {
  return (
    <Focusable
      onPress={onPress}
      label={label}
      autoFocus={autoFocus}
      focusScale={1.08}
      ring={false}
      sv={keyFace}
      vars={{ tone }}
      style={style}
    >
      {({ slots }) =>
        icon ? (
          <Icon name={icon} size={iconSize ?? 24} {...slots.glyph} />
        ) : (
          <Txt style={[slots.label, s.keyLabel, textStyle]}>{label}</Txt>
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

// Module scope, not the render body: this hands the same style identity to
// ~40 keys on every keystroke instead of rebuilding it each time.
const s = styles({
  keyLabel: { fontWeight: '700' },
  urlKey: { h: 52, flex: 1 },
  urlKeyText: { fontSize: 20 },
  urlClearKey: { h: 52, flex: 2 },
  urlClearText: { fontSize: 16 },
  urlSubmit: { h: 52, flex: 3 },
  keyRow: { row: true, gap: 12 },
});

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
        <FocusRegion key={row.join('')} style={s.keyRow}>
          {row.map((k, keyIndex) => (
            <Key
              key={k}
              label={k}
              autoFocus={rowIndex === 0 && keyIndex === 0}
              onPress={() => press(k)}
              style={s.urlKey}
              textStyle={s.urlKeyText}
              tone="url"
            />
          ))}
        </FocusRegion>
      ))}
      {/* Declared as a row: a plain box would make Left/Right do nothing
          between these three controls. */}
      <FocusRegion style={s.keyRow}>
        <Key
          label="⌧"
          onPress={() => onChange('')}
          style={s.urlClearKey}
          textStyle={s.urlClearText}
          tone="url"
        />
        <Key
          label="."
          onPress={() => onChange(`${value}.`)}
          style={s.urlKey}
          textStyle={s.urlKeyText}
          tone="url"
        />
        {onSubmit ? (
          <Button variant="primary" onPress={onSubmit} label={submitLabel} style={s.urlSubmit} />
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
    <Key key={id} label={label} onPress={onPress} style={face} textStyle={text} tone="search" />
  );
  const glyph = (id: string, icon: IconName, size: number, onPress: () => void) => (
    <Key key={id} icon={icon} iconSize={size} onPress={onPress} style={face} tone="search" />
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
