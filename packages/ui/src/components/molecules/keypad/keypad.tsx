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
import { Txt } from '#ui/components/atoms/text';
import { FocusColumn, FocusRegion } from '#ui/lib/focus-scope';
import { colors, radius } from '#ui/lib/tokens';

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

// A keyboard glyph rather than an icon: unlike the arrows, it has no emoji
// presentation to fall into on tvOS.
const DELETE = '⌫';

interface KeypadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  /** Takes the screen's focus on mount, landing on the 1 key. On by default:
   *  a PIN screen has nowhere else worth starting. */
  autoFocus?: boolean;
  /** Ignore presses (a code is being checked, a lockout is counting down). */
  disabled?: boolean;
}

function Keypad({ onDigit, onDelete, autoFocus = true, disabled }: Readonly<KeypadProps>) {
  const key = (label: string, onPress: () => void, fontSize = 28) => (
    <Focusable
      key={label}
      onPress={onPress}
      label={label}
      disabled={disabled}
      autoFocus={autoFocus && label === '1'}
      focusScale={1.08}
      ring={false}
      style={KEY}
      focusedStyle={FOCUSED}
      hoveredStyle={HOVERED}
    >
      {({ focused }) => (
        <Txt style={{ fontSize, fontWeight: '700' }} color={focused ? 'accent' : 'text'}>
          {label}
        </Txt>
      )}
    </Focusable>
  );
  return (
    <FocusColumn grid style={PAD}>
      {ROWS.map((row) => (
        <FocusRegion key={row.join('')} style={PAD_ROW}>
          {row.map((d) => key(d, () => onDigit(d)))}
        </FocusRegion>
      ))}
      <FocusRegion style={PAD_ROW}>
        {/* The spacer keeps 0 under the centre column with no OK key - in the
            LAYOUT through the box, and in the NAVIGATOR through the node, which
            occupies the row's first index without ever taking focus. */}
        <SpatialNavigationNode>
          <Box w={88} h={72} />
        </SpatialNavigationNode>
        {key('0', () => onDigit('0'))}
        {key(DELETE, onDelete, 22)}
      </FocusRegion>
    </FocusColumn>
  );
}

const PAD = { gap: 13 };
const PAD_ROW = { flexDirection: 'row' as const, gap: 13 };

const KEY = {
  height: 72,
  width: 88,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  borderRadius: radius['2xl'],
  backgroundColor: 'rgba(255, 255, 255, 0.06)',
};

const FOCUSED = { backgroundColor: colors.accentSoft };

// A key under the cursor lifts its own wash rather than borrowing the amber:
// on a PIN pad, amber says "this is where Enter goes".
const HOVERED = { backgroundColor: 'rgba(255, 255, 255, 0.12)' };

export type { KeypadProps };
export { Keypad };
