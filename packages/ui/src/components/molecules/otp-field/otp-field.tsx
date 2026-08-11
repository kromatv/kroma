// <OtpField>: the one-time-code entry, as a row of individual character slots.
// Replaces the web client's `input-otp` (a hidden <input> plus a render prop),
// a shape that can't exist on Apple TV: one off-screen TextInput owns the text
// here (so paste, SMS autofill and hardware typing keep working), while on a
// television there is no hidden input at all — the on-screen keypad feeds
// `onValueChange`, as <PinField> does.
//
// The parts follow shadcn's InputOTP anatomy (Root / Group / Slot / Separator)
// and the same `maxLength`, `pattern`, `onComplete` and REGEXP_* names, so a
// ported screen reads unchanged.
//
// Sibling: <PinField> is the masked-dots spelling of the same job, for a
// 10-foot secret PIN, and it is built out of these parts.

import {
  Children,
  isValidElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, TextInput } from 'react-native';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { styles } from '#ui/core';
import { useCompleteOnce } from '#ui/lib/use-complete-once';
import { useControllable } from '#ui/lib/use-controllable';
import {
  OtpFieldContext,
  type OtpFieldState,
  OtpGroupStartContext,
  useOtpSlot,
} from './otp-field-context';
import { Group, Separator, SLOT_GAP, Slot } from './otp-field-parts';
import { type OtpSize, otpVariants } from './otp-field-variants';

const REGEXP_ONLY_DIGITS = String.raw`^\d+$`;
const REGEXP_ONLY_CHARS = '^[a-zA-Z]+$';
const REGEXP_ONLY_DIGITS_AND_CHARS = '^[a-zA-Z0-9]+$';

interface OtpFieldRootProps extends Omit<BoxProps, 'children' | 'onChange'> {
  /** How many characters make a code. shadcn's name for the same prop. */
  maxLength?: number;
  /** Present: you own the value (controlled). Absent: the field runs itself. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (next: string) => void;
  /** Fired once, the instant the last slot fills. Auto-submit belongs here. */
  onComplete?: (code: string) => void;
  /** Which characters are allowed, tested per character rather than against
   *  the whole value, so a pasted code with stray spaces is cleaned rather
   *  than rejected outright. Use one of the REGEXP_* constants; defaults to
   *  digits only. */
  pattern?: string;
  disabled?: boolean;
  /** Show dots instead of the characters, for a secret PIN. */
  mask?: boolean;
  /** Paint every slot's edge red: the last code was rejected. */
  invalid?: boolean;
  size?: OtpSize;
  /** True when the shell has a real keyboard: mounts the off-screen entry so
   *  the code can be typed, pasted or autofilled. False (a television) leaves
   *  the slots presentational and expects `onValueChange` from a keypad. */
  physicalKeyboard?: boolean;
  /** Offer the platform's SMS one-time-code autofill. Off by default: a code
   *  that arrives by text message is the only thing it can fill, and iOS pays
   *  for the offer with a suggestion bar wedged above the keyboard. A pairing
   *  code read off a television and a profile PIN are neither of them SMS, so
   *  the bar would be a permanent ornament over a four-digit field. */
  smsAutofill?: boolean;
  autoFocus?: boolean;
  label?: string;
  /** Split the row into groups with a separator between them: `[3, 3]` is the
   *  classic six-digit code. Sugar for writing the groups out; ignored once
   *  `children` are given. */
  groups?: readonly number[];
  /** The <OtpField.Group> and <OtpField.Separator> parts, in the order they are
   *  drawn. Only a DIRECT Group child is given its place in the code. */
  children?: ReactNode;
}

function Root({
  maxLength = 6,
  value: valueProp,
  defaultValue = '',
  onValueChange,
  onComplete,
  pattern = REGEXP_ONLY_DIGITS,
  disabled = false,
  mask = false,
  invalid = false,
  size = 'md',
  physicalKeyboard = false,
  smsAutofill = false,
  autoFocus = false,
  label,
  groups,
  children,
  ...box
}: Readonly<OtpFieldRootProps>) {
  const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange);
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const allowed = useMemo(() => new RegExp(pattern), [pattern]);

  // Fire exactly once per fill - the shared rule, because a keypad-fed field
  // reaches a full code without the entry below ever seeing a keystroke, and a
  // code submitted twice is a lockout.
  const report = useCompleteOnce(maxLength, onComplete);
  useEffect(() => report(value), [value, report]);

  const commit = (next: string) => {
    if (disabled) return;
    const clean = [...next]
      .filter((char) => allowed.test(char))
      .slice(0, maxLength)
      .join('');
    if (clean === value) return;
    setValue(clean);
  };

  // A rejected code is checked with the row disabled and then handed back
  // empty, and iOS drops the keyboard the instant an input stops being
  // editable - `autoFocus` is a mount-time prop and never fires again. Without
  // this the retry has no caret and no keyboard. Only a field that asked for
  // the focus takes it back, so a screen stacking several codes (current, new,
  // confirm) is left alone.
  useEffect(() => {
    if (physicalKeyboard && autoFocus && !disabled) input.current?.focus();
  }, [physicalKeyboard, autoFocus, disabled]);

  // The caret sits in the next empty slot; a full code has none, because there
  // is nowhere left to type. It also tracks focus rather than mere presence: a
  // screen can stack several codes (current PIN, new PIN, confirm), and a caret
  // blinking in a field that would not receive the keystroke is a lie.
  const caretAt = physicalKeyboard && focused && !disabled ? value.length : -1;

  const ctx = useMemo<OtpFieldState>(
    () => ({
      size,
      mask,
      invalid,
      disabled,
      at: (index) => ({
        char: index < value.length ? (value[index] ?? null) : null,
        active: index === Math.min(value.length, maxLength - 1),
        caret: index === caretAt,
      }),
    }),
    [size, mask, invalid, disabled, value, maxLength, caretAt],
  );

  return (
    <OtpFieldContext.Provider value={ctx}>
      <Box row align="center" gap={SLOT_GAP} {...box}>
        {physicalKeyboard ? (
          <>
            {/* Transparent rather than hidden: `display: none` would cost the
                paste, the SMS autofill and the hardware typing that all need a
                real entry. */}
            <TextInput
              ref={input}
              value={value}
              onChangeText={commit}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              maxLength={maxLength}
              autoFocus={autoFocus}
              editable={!disabled}
              keyboardType="number-pad"
              inputMode={pattern === REGEXP_ONLY_DIGITS ? 'numeric' : 'text'}
              autoComplete={smsAutofill ? 'one-time-code' : 'off'}
              textContentType={smsAutofill ? 'oneTimeCode' : 'none'}
              importantForAutofill={smsAutofill ? 'yes' : 'no'}
              autoCorrect={false}
              autoCapitalize="characters"
              spellCheck={false}
              accessibilityLabel={label}
              caretHidden
              style={s.entry}
            />
            {/* UIKit refuses to hit-test a view at alpha 0, so on iOS the entry
                cannot be tapped however wide it is spread - this is what makes
                the whole row the control there, with the slots above kept as
                faces so a tap on one falls through to it. It stays under the
                entry, so on the web the native click still places the caret. */}
            <Pressable
              accessible={false}
              disabled={disabled}
              onPress={() => input.current?.focus()}
              style={s.hit}
            />
          </>
        ) : null}
        {placed(children ?? written(maxLength, groups))}
      </Box>
    </OtpFieldContext.Provider>
  );
}

// Yoga has no `order` and a context cannot be read backwards, so the Root walks
// its direct children once and tells each group where in the code it starts.
function placed(children: ReactNode): ReactNode {
  let start = 0;
  return Children.map(children, (child) => {
    if (!isValidElement(child) || child.type !== Group) return child;
    const at = start;
    start += Children.count((child.props as { children?: ReactNode }).children);
    return <OtpGroupStartContext.Provider value={at}>{child}</OtpGroupStartContext.Provider>;
  });
}

function runsOf(maxLength: number, groups: readonly number[] | undefined): number[] {
  if (!groups) return [maxLength];
  const runs: number[] = [];
  let left = maxLength;
  for (const count of groups) {
    if (left <= 0) break;
    runs.push(Math.min(count, left));
    left -= count;
  }
  if (left > 0) runs.push(left);
  return runs;
}

// Flat, never wrapped in a fragment: `placed` reads the Root's DIRECT children,
// and a fragment around a group would hide it and leave every group at zero.
function written(maxLength: number, groups: readonly number[] | undefined): ReactNode[] {
  const out: ReactNode[] = [];
  let index = 0;
  for (const [run, count] of runsOf(maxLength, groups).entries()) {
    if (run > 0) out.push(<Separator key={`seam-${run}`} />);
    out.push(
      <Group key={`group-${run}`}>
        {Array.from({ length: count }, (_, at) => `slot-${index + at}`).map((key) => (
          <Slot key={key} />
        ))}
      </Group>,
    );
    index += count;
  }
  return out;
}

// Invisible, not `display: none`: it has to stay in the tree to receive the
// paste, the autofill and the keystrokes.
const s = styles({
  entry: {
    absolute: true,
    left: 0,
    top: 0,
    w: '100%',
    h: '100%',
    opacity: 0,
    p: 0,
    borderWidth: 0,
    outlineWidth: 0,
    color: 'transparent',
    z: 1,
  },
  hit: { absolute: true, left: 0, top: 0, w: '100%', h: '100%' },
});

const OtpField = { Root, Group, Slot, Separator };

export type { OtpSlot } from './otp-field-context';
export type { OtpGroupProps } from './otp-field-parts';
export type { OtpFieldRootProps, OtpSize };
export {
  OtpField,
  otpVariants,
  REGEXP_ONLY_CHARS,
  REGEXP_ONLY_DIGITS,
  REGEXP_ONLY_DIGITS_AND_CHARS,
  useOtpSlot,
};
