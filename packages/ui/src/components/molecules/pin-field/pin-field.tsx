// <PinField>: the 10-foot spelling of <OtpField>, one dot per digit.
//
// Same mechanism, different face: the Root below is <OtpField.Root>, and the
// dots are faces reading `useOtpSlot()`. What is its own is the capture: a
// television cannot mount the off-screen entry <OtpField> types into, because a
// focused TextInput summons the platform keyboard over the screen, so a
// hardware keyboard is read window-wide instead and the remote's keypad feeds
// `onValueChange`.

import { useEffect, useRef } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { OtpField, useOtpSlot } from '#ui/components/molecules/otp-field';
import type { ColorValue } from '#ui/core';
import { webWindow } from '#ui/lib/dom';
import { useControllable } from '#ui/lib/use-controllable';

const DOT = 18;
const DOT_GAP = 18;

interface PinFieldProps extends Omit<BoxProps, 'children' | 'onChange'> {
  /** How many digits make a code. The dots row is exactly this wide. */
  maxLength?: number;
  /** Present: you own the buffer (controlled). Absent: the field runs itself. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (next: string) => void;
  /** Fired once, the instant the last digit lands. The TV PIN screen submits
   *  from here: a completed code validates with no OK press. */
  onComplete?: (code: string) => void;
  /** Ignore input (a request is in flight, a lockout is counting down). */
  disabled?: boolean;
  /** Paint the empty dots red: the last code was rejected. */
  invalid?: boolean;
  /** True when the shell has a real keyboard: digits and Delete are captured
   *  window-wide, so the code can simply be typed. On a TV this never
   *  attaches; the on-screen keypad feeds `onValueChange` instead. */
  physicalKeyboard?: boolean;
}

function PinField({
  maxLength = 4,
  value: valueProp,
  defaultValue = '',
  onValueChange,
  onComplete,
  disabled = false,
  invalid = false,
  physicalKeyboard = false,
  ...box
}: Readonly<PinFieldProps>) {
  const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange);
  useDigitKeys(physicalKeyboard, { value, maxLength, disabled, setValue });

  return (
    <OtpField.Root
      maxLength={maxLength}
      value={value}
      onValueChange={setValue}
      onComplete={onComplete}
      disabled={disabled}
      invalid={invalid}
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
  if (filled) return 'accent';
  return invalid ? 'danger' : 'tint/25';
}

interface Buffer {
  value: string;
  maxLength: number;
  disabled: boolean;
  setValue: (next: string) => void;
}

// Digits are not remote keys, so this cannot collide with D-pad navigation.
// Refs carry the changing state so the listener subscribes once.
function useDigitKeys(enabled: boolean, buffer: Buffer): void {
  const state = useRef(buffer);
  state.current = buffer;
  useEffect(() => {
    const w = enabled ? webWindow() : null;
    if (!w) return;
    const onKey = (event: KeyboardEvent) => {
      const { value, maxLength, disabled, setValue } = state.current;
      if (disabled) return;
      if (/^\d$/.test(event.key)) {
        if (value.length < maxLength) setValue(value + event.key);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        setValue(value.slice(0, -1));
      }
    };
    w.addEventListener('keydown', onKey);
    return () => w.removeEventListener('keydown', onKey);
  }, [enabled]);
}

export type { PinFieldProps };
export { PinField };
