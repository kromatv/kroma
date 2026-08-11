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
// the column on a vertical press — without it the navigator lands on a row's
// own remembered key, so Down from 3 went to 4 and every vertical press read
// as a diagonal.

import { SpatialNavigationNode } from 'react-tv-space-navigation';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Frost } from '#ui/components/atoms/frost';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { type RadiusToken, type StyleDecl, styles, svFor } from '#ui/core';
import { keyFace } from '#ui/lib/field-shell';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { FocusColumn, FocusRegion } from '#ui/lib/focus-scope';
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

type KeyKind = 'digit' | 'delete';
type KeypadSize = 'tv' | 'compact';

// By name, not in px: the face and the blur behind it must follow one theme.
const KEY_RADIUS: RadiusToken = '2xl';

const keypadVariants = svFor<{ root: StyleDecl; label: StyleDecl }>()({
  slots: {
    // The shared key face (lib/field-shell); the pad brings only its own box.
    root: { ...keyFace.root, radius: KEY_RADIUS },
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
  const tap = () => {
    void haptics?.selectionAsync();
  };
  const key = (label: string, onPress: () => void, kind: KeyKind = 'digit') => (
    <Focusable
      key={label}
      onPress={onPress}
      // The delete key draws a glyph, so its accessible name is a WORD: the
      // backspace character reaches a screen reader as "erase to the left",
      // or as nothing at all.
      label={kind === 'delete' ? t('common.delete') : label}
      disabled={disabled}
      autoFocus={autoFocus && label === '1'}
      focusScale={1.08}
      sv={keypadVariants}
      vars={{ kind, size }}
    >
      {(state) => (
        <>
          {/* The fill is translucent (lib/field-shell), so blur what shows
              through: the pad reads as glass over the artwork behind it. */}
          <Frost radius={KEY_RADIUS} />
          {kind === 'delete' ? (
            <Icon name="backspace" size={30} stroke={1.8} color="textMuted" />
          ) : (
            <Text style={state.slots.label}>{label}</Text>
          )}
        </>
      )}
    </Focusable>
  );
  return (
    <FocusColumn grid style={[s.pad, { gap: GAP[size] }]}>
      {ROWS.map((row) => (
        <FocusRegion key={row.join('')} style={[s.padRow, { gap: GAP[size] }]}>
          {row.map((d) =>
            key(d, () => {
              tap();
              onDigit(d);
            }),
          )}
        </FocusRegion>
      ))}
      <FocusRegion style={[s.padRow, { gap: GAP[size] }]}>
        {/* The spacer keeps 0 under the centre column with no OK key - in the
            LAYOUT through the box, and in the NAVIGATOR through the node, which
            occupies the row's first index without ever taking focus. */}
        <PadSpacer size={size} />
        {key('0', () => {
          tap();
          onDigit('0');
        })}
        {key(
          'delete',
          () => {
            tap();
            onDelete();
          },
          'delete',
        )}
      </FocusRegion>
    </FocusColumn>
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
