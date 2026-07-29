// <Keypad>: the remote's half of <PinField>.
//
// Nine digits, a zero and a delete, laid out as the phone dial everybody knows
// so the D-pad walks it without instructions. It ships next to the field it
// feeds because the pair is the whole interaction: a television has no keyboard,
// so a PIN screen is a display plus this - and until now the kit shipped the
// display and left every app to draw the keys.
//
// There is no OK key. The field completes itself on the last digit (see
// `onComplete`), so an OK would be a control that is never the right thing to
// press; the space under the centre column is left empty rather than filled with
// one, which is also what keeps 0 under 2, 5 and 8 where a hand expects it.
//
// Each row is its own <FocusRegion> inside a grid <FocusColumn>: the remote
// moves along a row with Left/Right and between rows with Up/Down, and the
// grid keeps the COLUMN on a vertical press - without it the navigator lands
// on a row's own remembered key, so Down from 3 went to 4 and every vertical
// press read as a diagonal. The navigator counts child INDICES, not pixels, so
// the bottom row's spacer registers as a (never focusable) node: it holds
// index zero, which is what keeps 0 under 8 and delete under 9 on the way down.

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

/** The delete key's face. A keyboard glyph rather than an icon, because it is
 * the character every keyboard on every platform already draws for this - and
 * unlike the arrows, it has no emoji presentation to fall into on tvOS. */
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

/** A key under the cursor lifts its own wash rather than borrowing the amber:
 * on a PIN pad the amber says "this is where Enter goes", and a mouse crossing
 * the pad on its way to the 7 must not keep claiming that. */
const HOVERED = { backgroundColor: 'rgba(255, 255, 255, 0.12)' };

export type { KeypadProps };
export { Keypad };
