import { useEffect, useEffectEvent } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { OtpField, useOtpSlot } from '#ui/components/molecules/otp-field';
import type { ColorValue } from '#ui/core';
import { type ChangeDetails, type ControlOf, defineControl, useControl } from '#ui/lib/control';
import { webWindow } from '#ui/lib/dom';

const DOT = 18;
const DOT_GAP = 18;

const pinFieldControl = defineControl('pin-field', {
  state: { value: '' },
  options: { maxLength: 4, disabled: false },
  actions: {
    append: ({ value, maxLength, disabled }, digit: string) =>
      disabled || !/^\d$/.test(digit) ? {} : { value: (value + digit).slice(0, maxLength) },
    erase: ({ value, disabled }) => (disabled ? {} : { value: value.slice(0, -1) }),
  },
});

interface PinFieldProps extends Omit<BoxProps, 'children' | 'onChange'> {
  /** How many digits make a code. The dots row is exactly this wide. */
  maxLength?: number;
  /** Present: you own the buffer (controlled). Absent: the field runs itself. */
  value?: string;
  defaultValue?: string;
  /** Told before the code changes; `details.cancel()` keeps it as it was. */
  onValueChange?: (next: string, details: ChangeDetails) => void;
  /** Fired once, the instant the last digit lands. The TV PIN screen submits
   *  from here: a completed code validates with no OK press. */
  onComplete?: (code: string) => void;
  /** Ignore input (a request is in flight, a lockout is counting down). */
  disabled?: boolean;
  /** Paint the empty dots red: the last code was rejected. */
  invalid?: boolean;
  /** Names the code to assistive tech. The dots are faces with no text to be
   *  read, so without it the row is an unnamed group. */
  label?: string;
  /** True when the shell has a real keyboard: digits and Delete are captured
   *  window-wide, so the code can simply be typed. On a TV this never
   *  attaches; the on-screen keypad feeds `onValueChange` instead. */
  physicalKeyboard?: boolean;
}

/** The 10-foot spelling of <OtpField>, one dot per digit. A television cannot mount
 *  the off-screen entry <OtpField> types into, as a focused TextInput summons the
 *  platform keyboard, so a hardware keyboard is read window-wide instead. */
function PinField({
  onComplete,
  invalid = false,
  label,
  physicalKeyboard = false,
  ...props
}: Readonly<PinFieldProps>) {
  const [pin, box] = useControl(pinFieldControl, props);
  const { value, maxLength, disabled, setValue } = pin;
  useDigitKeys(physicalKeyboard, pin);

  return (
    <OtpField.Root
      maxLength={maxLength}
      value={value}
      onValueChange={setValue}
      onComplete={onComplete}
      disabled={disabled}
      invalid={invalid}
      label={label}
      opacity={disabled ? 0.6 : 1}
      {...box}
    >
      <OtpField.Group gap={DOT_GAP}>
        {Array.from({ length: maxLength }, (_, at) => `pin-dot-${at}`).map((key) => (
          <Dot key={key} />
        ))}
      </OtpField.Group>
    </OtpField.Root>
  );
}

function Dot() {
  const { char, invalid } = useOtpSlot();
  const filled = char != null;
  return (
    <Box
      w={DOT}
      h={DOT}
      radius="pill"
      borderWidth={2}
      bg={filled ? 'accent' : 'transparent'}
      border={dotEdge(filled, invalid)}
    />
  );
}

function dotEdge(filled: boolean, invalid: boolean): ColorValue {
  if (filled) {
    return 'accent';
  }
  return invalid ? 'danger' : 'tint/25';
}

// Digits are not remote keys, so this cannot collide with D-pad navigation.
// An effect event reads the live buffer, so the listener subscribes once.
function useDigitKeys(enabled: boolean, pin: ControlOf<typeof pinFieldControl>): void {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      pin.erase();
    } else {
      pin.append(event.key);
    }
  });
  useEffect(() => {
    const w = enabled ? webWindow() : null;
    if (!w) {
      return undefined;
    }
    w.addEventListener('keydown', onKey);
    return () => w.removeEventListener('keydown', onKey);
  }, [enabled]);
}

export type { PinFieldProps };
export { PinField };
