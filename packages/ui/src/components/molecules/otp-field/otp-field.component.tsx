// <OtpField>: the one-time-code entry, as a row of individual character slots.
// Replaces the web client's `input-otp` (a hidden <input> plus a render prop),
// a shape that can't exist on Apple TV: one off-screen TextInput owns the text
// here (so paste, SMS autofill and hardware typing keep working), while on a
// television there is no hidden input at all: the on-screen keypad feeds
// `onValueChange`, as <PinField> does.
//
// The parts follow shadcn's InputOTP anatomy (Root / Group / Slot / Separator)
// and the same `maxLength`, `pattern`, `onComplete` and REGEXP_* names, so a
// ported screen reads unchanged.
//
// Sibling: <PinField> is the masked-dots spelling of the same job, for a
// 10-foot secret PIN, and it is built out of these parts.

import { Children, isValidElement, type ReactNode, useEffect, useMemo, useRef } from 'react';
import { Pressable, TextInput } from 'react-native';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { type ChangeDetails, useControl } from '#ui/lib/control';
import { NO_ZOOM_FONT_SIZE } from '#ui/lib/field-shell';
import { useFocusWithin } from '#ui/lib/focus-within.hook';
import { useCompleteOnce } from '#ui/lib/use-complete-once.hook';
import { otpFieldControl, REGEXP_ONLY_DIGITS } from './otp-field-control';
import { OtpFieldContext, type OtpFieldState, OtpGroupStartContext } from './otp-field-context';
import { Group, Separator, SLOT_GAP, Slot } from './otp-field-parts.component';
import type { OtpSize } from './otp-field-variants';

interface OtpFieldRootProps extends Omit<BoxProps, 'children' | 'onChange'> {
  /** How many characters make a code. shadcn's name for the same prop. */
  maxLength?: number;
  /** Present: you own the value (controlled). Absent: the field runs itself. */
  value?: string;
  defaultValue?: string;
  /** Told before the code changes; `details.cancel()` keeps it as it was. */
  onValueChange?: (next: string, details: ChangeDetails) => void;
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
  /** The <OtpField.Group> and <OtpField.Separator> parts, in the order they are
   *  drawn. Only a DIRECT Group child is given its place in the code. Left out,
   *  the row is one group of `maxLength` slots. */
  children?: ReactNode;
}

function Root({
  onComplete,
  mask = false,
  invalid = false,
  size = 'md',
  physicalKeyboard = false,
  smsAutofill = false,
  autoFocus = false,
  label,
  children,
  ...props
}: Readonly<OtpFieldRootProps>) {
  const s = useStyles(sDefinition);

  const [{ value, maxLength, pattern, disabled, type }, box] = useControl(otpFieldControl, props);
  const input = useRef<TextInput>(null);
  const within = useFocusWithin();

  // Fire exactly once per fill - the shared rule, because a keypad-fed field
  // reaches a full code without the entry below ever seeing a keystroke, and a
  // code submitted twice is a lockout.
  const report = useCompleteOnce(maxLength, onComplete);
  useEffect(() => report(value), [value, report]);

  // A rejected code is checked with the row disabled and then handed back
  // empty, and iOS drops the keyboard the instant an input stops being
  // editable - `autoFocus` is a mount-time prop and never fires again. Without
  // this the retry has no caret and no keyboard. Only a field that asked for
  // the focus takes it back, so a screen stacking several codes (current, new,
  // confirm) is left alone.
  useEffect(() => {
    if (physicalKeyboard && autoFocus && !disabled) {
      input.current?.focus();
    }
  }, [physicalKeyboard, autoFocus, disabled]);

  // The caret sits in the next empty slot; a full code has none, because there
  // is nowhere left to type. It also tracks focus rather than mere presence: a
  // screen can stack several codes (current PIN, new PIN, confirm), and a caret
  // blinking in a field that would not receive the keystroke is a lie.
  const caretAt = physicalKeyboard && within.focused && !disabled ? value.length : -1;

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
    <OtpFieldContext value={ctx}>
      <Box
        row
        align="center"
        gap={SLOT_GAP}
        // The name rides the entry where there is one. A keypad shell mounts
        // none, and the slots are faces, so the row is the only thing left to
        // carry it.
        {...(physicalKeyboard ? null : { role: 'group' as const, accessibilityLabel: label })}
        {...box}
      >
        {physicalKeyboard ? (
          <>
            {/* Transparent rather than hidden: `display: none` would cost the
                paste, the SMS autofill and the hardware typing that all need a
                real entry. */}
            <TextInput
              ref={input}
              value={value}
              onChangeText={type}
              onFocus={within.onFocus}
              onBlur={within.onBlur}
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
        {placed(children ?? oneGroup(maxLength))}
      </Box>
    </OtpFieldContext>
  );
}

// Yoga has no `order` and a context cannot be read backwards, so the Root walks
// its direct children once and tells each group where in the code it starts.
function placed(children: ReactNode): ReactNode {
  let start = 0;
  return Children.map(children, (child) => {
    if (!isValidElement(child) || child.type !== Group) {
      return child;
    }
    const at = start;
    start += Children.count((child.props as { children?: ReactNode }).children);
    return <OtpGroupStartContext value={at}>{child}</OtpGroupStartContext>;
  });
}

// The unbroken row, for a code nobody asked to arrange. A bare element rather
// than a fragment: `placed` reads the Root's DIRECT children, and a fragment
// around the group would hide it and leave it at zero.
function oneGroup(maxLength: number): ReactNode {
  return (
    <Group>
      {Array.from({ length: maxLength }, (_, at) => `slot-${at}`).map((key) => (
        <Slot key={key} />
      ))}
    </Group>
  );
}

const sDefinition = styles({
  entry: {
    absolute: true,
    start: 0,
    top: 0,
    w: '100%',
    h: '100%',
    opacity: 0,
    p: 0,
    borderWidth: 0,
    outlineWidth: 0,
    color: 'transparent',
    fontSize: NO_ZOOM_FONT_SIZE,
    z: 1,
  },
  hit: { absolute: true, start: 0, top: 0, w: '100%', h: '100%' },
});

const OtpField = { Root, Group, Slot, Separator };

export type { OtpSlot } from './otp-field-context';
export { useOtpSlot } from './otp-field-context';
export type { OtpGroupProps } from './otp-field-parts.component';
export { otpVariants } from './otp-field-variants';
export type { OtpFieldRootProps, OtpSize };
export {
  REGEXP_ONLY_CHARS,
  REGEXP_ONLY_DIGITS,
  REGEXP_ONLY_DIGITS_AND_CHARS,
} from './otp-field-control';
export { OtpField };
