// <OtpField>: the one-time-code entry, as a row of individual character slots.
//
// This is the universal replacement for the web client's `input-otp` wrapper.
// That library is a hidden <input> plus a render prop, which is exactly the
// shape that cannot exist on Apple TV, so the same idea is rebuilt here on the
// kit's own primitives: one off-screen TextInput owns the text (so paste, SMS
// autofill and hardware typing all keep working) while the slots are ordinary
// views the design controls. On a television there is no hidden input at all -
// the on-screen keypad feeds `onChange`, exactly as <PinField> does.
//
// The API deliberately mirrors shadcn's InputOTP - `maxLength`, `value`,
// `onChange`, `pattern`, `onComplete`, `disabled` - and the REGEXP_* constants
// carry the same names, so a screen ported from the web reads unchanged. What
// shadcn spells as three nested components (InputOTPGroup / InputOTPSlot /
// InputOTPSeparator) is spelled here as `groups={[3, 3]}`: React Native has no
// className to hang the grouping off, and a number per group says the same
// thing without four components to keep in step.
//
// Sibling: <PinField> is the DOTS spelling of the same job, for the 10-foot
// secret PIN. Use OtpField when the characters should be legible (a pairing
// code, an emailed code) or when the slots themselves carry the design.

import { type ReactNode, useMemo, useRef } from 'react';
import { TextInput } from 'react-native';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { Caret } from '#ui/lib/caret';
import { sv } from '#ui/lib/sv';
import { colors, radius as radii } from '#ui/lib/tokens';
import { useCompleteOnce } from '#ui/lib/use-complete-once';
import { useControllable } from '#ui/lib/use-controllable';

/** The same names `input-otp` (and therefore shadcn) exports, so a `pattern`
 * copied from a web screen keeps working. They are whole-value regexes there;
 * here each candidate CHARACTER is tested against the pattern, which means a
 * code pasted with stray spaces is cleaned instead of rejected outright. */
const REGEXP_ONLY_DIGITS = String.raw`^\d+$`;
const REGEXP_ONLY_CHARS = '^[a-zA-Z]+$';
const REGEXP_ONLY_DIGITS_AND_CHARS = '^[a-zA-Z0-9]+$';

const otpVariants = sv({
  slots: {
    slot: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      backgroundColor: colors.surface2,
      borderColor: colors.borderStrong,
    },
    char: { fontWeight: '600', color: colors.text },
  },
  variants: {
    size: {
      md: { slot: { width: 52, height: 60, borderRadius: radii.lg }, char: { fontSize: 26 } },
      /** The 10-foot size: a pairing code read from the sofa. */
      tv: { slot: { width: 72, height: 84, borderRadius: radii.xl }, char: { fontSize: 38 } },
    },
    /** Where this slot sits relative to what has been typed. `active` is the
     *  slot the next character lands in, and the only one with a caret. */
    state: {
      empty: {},
      filled: {},
      active: { slot: { borderColor: colors.accent, backgroundColor: colors.accentSoft } },
    },
    invalid: {
      true: { slot: { borderColor: colors.danger } },
      false: {},
    },
  },
  compound: [
    // A rejected code keeps its red edge even under the caret, so the field
    // does not look like it has forgotten the error the moment it is retried.
    {
      when: { state: 'active', invalid: 'true' },
      style: { slot: { borderColor: colors.danger } },
    },
  ],
  defaults: { size: 'md', state: 'empty', invalid: 'false' },
});

type OtpSize = 'md' | 'tv';

/** What a slot knows about itself. The same three facts `input-otp` hands its
 * render prop, so a custom slot ports across. */
interface OtpSlot {
  /** The character in this slot, or null when it is still empty. */
  char: string | null;
  /** True for the slot the next character lands in. */
  isActive: boolean;
  /** True when this slot should paint the blinking insertion point. */
  hasFakeCaret: boolean;
}

interface OtpFieldProps extends Omit<BoxProps, 'children' | 'onChange'> {
  /** How many characters make a code. shadcn's name for the same prop. */
  maxLength?: number;
  /** Present: you own the value (controlled). Absent: the field runs itself. */
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  /** Fired once, the instant the last slot fills. Auto-submit belongs here. */
  onComplete?: (code: string) => void;
  /** Which characters are allowed, as a regex source string. Use one of the
   *  REGEXP_* constants. Defaults to digits only. */
  pattern?: string;
  disabled?: boolean;
  /** Show dots instead of the characters, for a secret PIN. */
  mask?: boolean;
  /** Paint every slot's edge red: the last code was rejected. */
  invalid?: boolean;
  size?: OtpSize;
  /** Split the row into groups with a separator between them: `[3, 3]` is the
   *  classic six-digit code. Omit for one unbroken row. */
  groups?: readonly number[];
  /** True when the shell has a real keyboard: mounts the off-screen entry so
   *  the code can be typed, pasted or autofilled. False (a television) leaves
   *  the slots presentational and expects `onChange` from a keypad. */
  physicalKeyboard?: boolean;
  autoFocus?: boolean;
  label?: string;
  /** Render a slot yourself. The kit's own slot is used when this is absent. */
  renderSlot?: (slot: OtpSlot, index: number) => ReactNode;
}

function OtpField({
  maxLength = 6,
  value: valueProp,
  defaultValue = '',
  onChange,
  onComplete,
  pattern = REGEXP_ONLY_DIGITS,
  disabled = false,
  mask = false,
  invalid = false,
  size = 'md',
  groups,
  physicalKeyboard = false,
  autoFocus = false,
  label,
  renderSlot,
  ...box
}: Readonly<OtpFieldProps>) {
  const [value, setValue] = useControllable(valueProp, defaultValue, onChange);
  const input = useRef<TextInput>(null);

  // One compiled matcher per pattern, applied per character: a pasted code with
  // spaces or dashes is cleaned rather than thrown away.
  const allowed = useMemo(() => new RegExp(pattern), [pattern]);

  // Fire exactly once per fill - the shared rule, because <PinField> needs the
  // same one and a code submitted twice is a lockout.
  const report = useCompleteOnce(maxLength, onComplete);
  const commit = (next: string) => {
    if (disabled) return;
    const clean = [...next]
      .filter((char) => allowed.test(char))
      .slice(0, maxLength)
      .join('');
    if (clean === value) return;
    setValue(clean);
    report(clean);
  };

  const slots: OtpSlot[] = Array.from({ length: maxLength }, (_, at) => ({
    char: at < value.length ? (value[at] ?? null) : null,
    isActive: at === Math.min(value.length, maxLength - 1),
    // The caret sits in the next empty slot; a full code has none, because
    // there is nowhere left to type.
    hasFakeCaret: physicalKeyboard && !disabled && at === value.length,
  }));

  return (
    <Box row align="center" gap={12} opacity={disabled ? 0.5 : 1} {...box}>
      {physicalKeyboard ? (
        // Off-screen rather than hidden: `opacity: 0` still leaves a focusable,
        // pasteable, autofillable entry, which is the whole trick behind an OTP
        // field that also supports SMS codes. It covers the row so a tap
        // anywhere on the slots lands the caret.
        <TextInput
          ref={input}
          value={value}
          onChangeText={commit}
          maxLength={maxLength}
          autoFocus={autoFocus}
          editable={!disabled}
          keyboardType="number-pad"
          inputMode={pattern === REGEXP_ONLY_DIGITS ? 'numeric' : 'text'}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          autoCorrect={false}
          autoCapitalize="characters"
          spellCheck={false}
          accessibilityLabel={label}
          caretHidden
          style={ENTRY}
        />
      ) : null}
      {slots.map((slot, at) => (
        // A code is a fixed row of positions: slot 3 IS the identity of the
        // third box, and nothing is ever inserted, removed or reordered.
        // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
        <Box row align="center" gap={12} key={at}>
          {renderSlot ? (
            renderSlot(slot, at)
          ) : (
            <Slot slot={slot} size={size} invalid={invalid} mask={mask} />
          )}
          {isGroupEnd(groups, at, maxLength) ? <Separator /> : null}
        </Box>
      ))}
    </Box>
  );
}

/** True when a separator belongs after this slot: the index closes a group and
 * is not the very last slot. */
function isGroupEnd(groups: readonly number[] | undefined, at: number, maxLength: number): boolean {
  if (!groups || at === maxLength - 1) return false;
  let edge = 0;
  for (const count of groups) {
    edge += count;
    if (at === edge - 1) return true;
  }
  return false;
}

/** Which of the slot variants this slot is in. A filled slot reads as filled
 * even while it is the active one, because the character is the stronger signal. */
function slotState(slot: OtpSlot): 'filled' | 'active' | 'empty' {
  if (slot.char != null) return 'filled';
  return slot.isActive ? 'active' : 'empty';
}

function Slot({
  slot,
  size,
  invalid,
  mask,
}: Readonly<{ slot: OtpSlot; size: OtpSize; invalid: boolean; mask: boolean }>) {
  const state = slotState(slot);
  const s = otpVariants({ size, state, invalid: invalid ? 'true' : 'false' });
  return (
    <Box style={s.slot}>
      {slot.char == null ? null : <Txt style={s.char}>{mask ? '•' : slot.char}</Txt>}
      {slot.hasFakeCaret ? <Caret absolute height={size === 'tv' ? 44 : 30} /> : null}
    </Box>
  );
}

/** The dash between two groups. */
function Separator() {
  return <Box w={12} h={2} radius="pill" bg={colors.borderStrong} />;
}

/** Off-screen, not `display: none`: it has to stay focusable to receive the
 * paste, the autofill and the keystrokes. */
const ENTRY = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  padding: 0,
  borderWidth: 0,
  outlineWidth: 0,
  color: 'transparent',
  zIndex: 1,
} as const;

export type { OtpFieldProps, OtpSize, OtpSlot };
export {
  OtpField,
  otpVariants,
  REGEXP_ONLY_CHARS,
  REGEXP_ONLY_DIGITS,
  REGEXP_ONLY_DIGITS_AND_CHARS,
};
