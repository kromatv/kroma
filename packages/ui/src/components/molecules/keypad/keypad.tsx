// <Keypad>: the remote's half of <PinField>. Nine digits, a zero and a
// delete, laid out as the phone dial everybody knows so the D-pad walks it
// without instructions.
//
// There is no OK key: the field completes itself on the last digit (see
// `onComplete`), so the space under the centre column is left empty rather
// than filled with one, which also keeps 0 under 2, 5 and 8 where a hand
// expects it.
//
// Each row is its own <FocusRegion> inside a grid <FocusColumn>, which keeps
// the column on a vertical press. Without it the navigator lands on a row's
// own remembered key, so Down from 3 went to 4 and every vertical press read
// as a diagonal.

import { SpatialNavigationNode } from 'react-tv-space-navigation';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { useFrostCoat } from '#ui/components/atoms/frost';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { type StyleDecl, styles, svFor } from '#ui/core';
import { HAND } from '#ui/lib/cursor';
import { keyFace } from '#ui/lib/field-shell';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusColumn, FocusRegion } from '#ui/lib/focus-scope';
import { useStableCallback } from '#ui/lib/stable-callback';
import { useTDefault } from '#ui/services/i18n';

// A pad we draw has no click of its own, so a phone answers a key with its
// Taptic Engine or the thing feels dead under a thumb. Guard-required rather
// than imported: a television has no haptics and the browser shells have no
// module, and a bare `import` would break both. (`await import()` is not an
// option under Metro - it throws in dev builds.)
function loadHaptics(): { selectionAsync: () => Promise<void> } | null {
  try {
    return require('expo-haptics');
  } catch {
    return null;
  }
}
const haptics = loadHaptics();

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

const DELETE = 'delete';

type KeyKind = 'digit' | 'delete';
type KeypadSize = 'tv' | 'compact';

// By name, not in px: the face and the blur behind it must follow one theme.

const keypadVariants = svFor<{ root: StyleDecl; label: StyleDecl }>()({
  slots: {
    // The shared key face (lib/field-shell); the pad brings only its own box.
    root: { ...keyFace.root, radius: '2xl' },
    label: keyFace.label,
  },
  variants: {
    kind: {
      digit: { label: { text: 'subheading' } },
      delete: {},
    },
    size: {
      // A remote's key, sized for the far end of a room.
      tv: { root: { w: 88, h: 72 } },
      // A thumb's key: as large as the four rows can be and still leave the
      // viewfinder above them on the shortest phone. Sized against that budget
      // rather than picked - a remote's 88x72 overflows, and anything under
      // this is small for a thumb without buying room anything else needs.
      compact: { root: { w: 80, h: 64 } },
    },
  },
  defaults: { kind: 'digit', size: 'tv' },
});

const GAP = { tv: 13, compact: 10 } as const;

interface KeypadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  /** `tv` is a remote's pad, read across a room. `compact` is a thumb's, for a
   *  phone, where the pad shares the screen with everything else. */
  size?: KeypadSize;
  /** Takes the screen's focus on mount, landing on the 1 key. On by default:
   *  a PIN screen has nowhere else worth starting. */
  autoFocus?: boolean;
  /** Ignore presses (a code is being checked, a lockout is counting down). */
  disabled?: boolean;
}

function Keypad({
  onDigit,
  onDelete,
  size = 'tv',
  autoFocus = true,
  disabled,
}: Readonly<KeypadProps>) {
  const t = useTDefault();
  const gap = GAP[size];
  const padRow = [s.padRow, { gap }];
  // One handler for the whole pad, whose identity never moves: a closure per
  // key carries the caller's own handler, and rebuilds all eleven keys with it
  // every time the PIN behind them grows a digit.
  const press = useStableCallback((value: string) => {
    void haptics?.selectionAsync();
    if (value === DELETE) onDelete();
    else onDigit(value);
  });
  return (
    <FocusColumn grid style={[HAND, s.pad, { gap }]}>
      {ROWS.map((row) => (
        <FocusRegion key={row.join('')} style={padRow}>
          {row.map((d) => (
            <PadKey
              key={d}
              value={d}
              label={d}
              size={size}
              disabled={disabled}
              autoFocus={autoFocus && d === '1'}
              onPress={press}
            />
          ))}
        </FocusRegion>
      ))}
      <FocusRegion style={padRow}>
        {/* The spacer keeps 0 under the centre column with no OK key - in the
            LAYOUT through the box, and in the NAVIGATOR through the node, which
            occupies the row's first index without ever taking focus. */}
        <PadSpacer size={size} />
        <PadKey value="0" label="0" size={size} disabled={disabled} onPress={press} />
        {/* The delete key draws a glyph, so its accessible name is a WORD: the
            backspace character reaches a screen reader as "erase to the left",
            or as nothing at all. */}
        <PadKey
          value={DELETE}
          label={t('common.delete')}
          kind="delete"
          size={size}
          disabled={disabled}
          onPress={press}
        />
      </FocusRegion>
    </FocusColumn>
  );
}

interface PadKeyProps {
  value: string;
  label: string;
  kind?: KeyKind;
  size: KeypadSize;
  disabled?: boolean;
  autoFocus?: boolean;
  onPress: (value: string) => void;
}

function PadKey({
  value,
  label,
  kind = 'digit',
  size,
  disabled,
  autoFocus,
  onPress,
}: Readonly<PadKeyProps>) {
  const frost = useFrostCoat(keypadVariants({ kind, size }).root);
  return (
    <Focusable
      onPress={() => onPress(value)}
      label={label}
      disabled={disabled}
      autoFocus={autoFocus}
      focusScale={1.08}
      sv={keypadVariants}
      vars={{ kind, size }}
      style={frost.style}
    >
      {(state) => (
        <>
          {frost.layer}
          {kind === 'delete' ? (
            <Icon name="backspace" size={30} thickness={1.8} color="textMuted" />
          ) : (
            <Text style={state.slots.label}>{label}</Text>
          )}
        </>
      )}
    </Focusable>
  );
}

// The spacer under the centre column. Wrapped in a navigator node ONLY where
// there is a navigator: a phone has none, and `SpatialNavigationNode` throws
// rather than degrading the way <FocusRegion> and <Focusable> do - which is
// what made this pad, and any screen holding it, unrenderable off a television.
function PadSpacer({ size }: Readonly<{ size: KeypadSize }>) {
  const box = size === 'compact' ? <Box w={80} h={64} /> : <Box w={88} h={72} />;
  return useInsideFocusScope() ? <SpatialNavigationNode>{box}</SpatialNavigationNode> : box;
}

const s = styles({
  pad: {},
  padRow: { row: true },
});

export type { KeypadProps };
export { Keypad, keypadVariants };
