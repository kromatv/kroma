// <OtpField>: the one-time-code entry, as a row of individual character slots.
// Replaces the web client's `input-otp` (a hidden <input> plus a render prop),
// a shape that can't exist on Apple TV: one off-screen TextInput owns the text
// here (so paste, SMS autofill and hardware typing keep working), while on a
// television there is no hidden input at all — the on-screen keypad feeds
// `onChange`, as <PinField> does.
//
// The API mirrors shadcn's InputOTP (`maxLength`, `value`, `onChange`,
// `pattern`, `onComplete`, `disabled`, the REGEXP_* names) so a ported screen
// reads unchanged; `groups={[3, 3]}` replaces its nested Group/Slot/Separator
// components.
//
// Sibling: <PinField> is the masked-dots spelling of the same job, for a
// 10-foot secret PIN.

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Frost } from '#ui/components/atoms/frost';
import { Txt } from '#ui/components/atoms/text';
import { type RadiusToken, styles, sv } from '#ui/core';
import { Caret } from '#ui/lib/caret';
import { CONTROL } from '#ui/lib/field-shell';
import { useCompleteOnce } from '#ui/lib/use-complete-once';
import { useControllable } from '#ui/lib/use-controllable';

const REGEXP_ONLY_DIGITS = String.raw`^\d+$`;
const REGEXP_ONLY_CHARS = '^[a-zA-Z]+$';
const REGEXP_ONLY_DIGITS_AND_CHARS = '^[a-zA-Z0-9]+$';

// <Frost> clips itself to the corner rather than inheriting it, so the radius
// each size gives its slot has to be stated where the frost can read it too.
const SLOT_RADIUS = { md: 'lg', tv: 'xl' } as const satisfies Record<string, RadiusToken>;

const otpVariants = sv({
  slots: {
    slot: { center: true, bg: CONTROL.md.bg, border: 'borderStrong' },
    char: { fontWeight: '600', color: 'text' },
  },
  variants: {
    size: {
      md: { slot: { w: 52, h: 60, radius: SLOT_RADIUS.md }, char: { fontSize: 26 } },
      tv: { slot: { w: 72, h: 84, radius: SLOT_RADIUS.tv }, char: { fontSize: 38 } },
    },
    /** `active` is the slot the next character lands in, and the only one with a caret. */
    state: {
      empty: {},
      filled: {},
      active: { slot: { borderColor: 'accent', bg: 'accentSoft' } },
    },
    /** Dimmed by colour, never by a row `opacity`: fading the row would fade
     *  the FROST with it and let the backdrop through as a legible picture.
     *  The well keeps its fill and only the edge and the ink recede. Declared
     *  before `invalid` so a lockout keeps its red edge. */
    disabled: {
      true: { slot: { borderColor: 'border' }, char: { color: 'textDim' } },
    },
    invalid: {
      true: { slot: { borderColor: 'danger' } },
    },
  },
  compound: [
    // A rejected code keeps its red edge even under the caret, so the field
    // does not look like it has forgotten the error the moment it is retried.
    {
      when: { state: 'active', invalid: true },
      style: { slot: { borderColor: 'danger' } },
    },
  ],
  defaults: { size: 'md', state: 'empty', disabled: false, invalid: false },
});

type OtpSize = 'md' | 'tv';

/** The same three facts `input-otp` hands its render prop, so a custom slot ports across. */
interface OtpSlot {
  char: string | null;
  /** True for the slot the next character lands in. */
  isActive: boolean;
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
  /** Split the row into groups with a separator between them: `[3, 3]` is the
   *  classic six-digit code. Omit for one unbroken row. */
  groups?: readonly number[];
  /** True when the shell has a real keyboard: mounts the off-screen entry so
   *  the code can be typed, pasted or autofilled. False (a television) leaves
   *  the slots presentational and expects `onChange` from a keypad. */
  physicalKeyboard?: boolean;
  /** Offer the platform's SMS one-time-code autofill. Off by default: a code
   *  that arrives by text message is the only thing it can fill, and iOS pays
   *  for the offer with a suggestion bar wedged above the keyboard. A pairing
   *  code read off a television and a profile PIN are neither of them SMS, so
   *  the bar would be a permanent ornament over a four-digit field. */
  smsAutofill?: boolean;
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
  smsAutofill = false,
  autoFocus = false,
  label,
  renderSlot,
  ...box
}: Readonly<OtpFieldProps>) {
  const [value, setValue] = useControllable(valueProp, defaultValue, onChange);
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

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

  const slots: OtpSlot[] = Array.from({ length: maxLength }, (_, at) => ({
    char: at < value.length ? (value[at] ?? null) : null,
    isActive: at === Math.min(value.length, maxLength - 1),
    hasFakeCaret: at === caretAt,
  }));

  return (
    <Box row align="center" gap={12} {...box}>
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
              the whole row the control there, with the slots below kept as
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
      {slots.map((slot, at) => (
        // A code is a fixed row of positions: slot 3 IS the identity of the
        // third box, and nothing is ever inserted, removed or reordered.
        // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
        <Box row align="center" gap={12} key={at} pointerEvents="none">
          {renderSlot ? (
            renderSlot(slot, at)
          ) : (
            <Slot slot={slot} size={size} invalid={invalid} disabled={disabled} mask={mask} />
          )}
          {isGroupEnd(groups, at, maxLength) ? <Separator /> : null}
        </Box>
      ))}
    </Box>
  );
}

function isGroupEnd(groups: readonly number[] | undefined, at: number, maxLength: number): boolean {
  if (!groups || at === maxLength - 1) return false;
  let edge = 0;
  for (const count of groups) {
    edge += count;
    if (at === edge - 1) return true;
  }
  return false;
}

// A filled slot reads as filled even while it is also the active one: the
// character is the stronger signal.
function slotState(slot: OtpSlot): 'filled' | 'active' | 'empty' {
  if (slot.char != null) return 'filled';
  return slot.isActive ? 'active' : 'empty';
}

function Slot({
  slot,
  size,
  invalid,
  disabled,
  mask,
}: Readonly<{ slot: OtpSlot; size: OtpSize; invalid: boolean; disabled: boolean; mask: boolean }>) {
  const state = slotState(slot);
  const s = otpVariants({ size, state, invalid, disabled });
  return (
    <Box style={s.slot}>
      {/* The fill is translucent (lib/field-shell), so blur what shows through:
          a code entry over the sign-in artwork reads as glass like every other
          control, rather than as an opaque chip punched out of it. */}
      <Frost radius={SLOT_RADIUS[size]} />
      {slot.char == null ? null : <Txt style={s.char}>{mask ? '•' : slot.char}</Txt>}
      {slot.hasFakeCaret ? <Caret absolute height={size === 'tv' ? 44 : 30} /> : null}
    </Box>
  );
}

function Separator() {
  return <Box w={12} h={2} radius="pill" bg="borderStrong" />;
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

export type { OtpFieldProps, OtpSize, OtpSlot };
export {
  OtpField,
  otpVariants,
  REGEXP_ONLY_CHARS,
  REGEXP_ONLY_DIGITS,
  REGEXP_ONLY_DIGITS_AND_CHARS,
};
