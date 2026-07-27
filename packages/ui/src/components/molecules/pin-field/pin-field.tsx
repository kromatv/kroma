// <PinField>: the fixed-length code entry, shown as one dot per digit.
//
// Extracted from the TV's PIN screen, where it was written first: the dots,
// the buffer discipline (never longer than `length`, digits only) and the
// hardware-keyboard capture are the reusable part; WHAT a completed code means
// (verify, set, clear) stays with the screen. Like every kit form primitive it
// runs controlled (pass `value`) or uncontrolled (pass nothing), and on a
// television the platform keypad simply feeds `onChange`.

import { useEffect, useRef } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { webWindow } from '#ui/lib/dom';
import { colors } from '#ui/lib/tokens';
import { useCompleteOnce } from '#ui/lib/use-complete-once';
import { useControllable } from '#ui/lib/use-controllable';

interface PinFieldProps extends Omit<BoxProps, 'children' | 'onChange'> {
  /** How many digits make a code. The dots row is exactly this wide. */
  length?: number;
  /** Present: you own the buffer (controlled). Absent: the field runs itself. */
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  /** Fired once, the instant the last digit lands. The TV PIN screen submits
   *  from here: a completed code validates with no OK press. */
  onComplete?: (code: string) => void;
  /** Ignore input (a request is in flight, a lockout is counting down). */
  disabled?: boolean;
  /** Paint the empty dots red: the last code was rejected. */
  error?: boolean;
  /** True when the shell has a real keyboard: digits and Delete are captured
   *  window-wide, so the code can simply be typed. On a TV this never
   *  attaches; the on-screen keypad feeds `onChange` instead. */
  physicalKeyboard?: boolean;
  /** Dot diameter. The TV PIN screen uses the default. */
  dot?: number;
}

function PinField({
  length = 4,
  value: valueProp,
  defaultValue = '',
  onChange,
  onComplete,
  disabled = false,
  error = false,
  physicalKeyboard = false,
  dot = 18,
  ...box
}: Readonly<PinFieldProps>) {
  const [value, setValue] = useControllable(valueProp, defaultValue, onChange);

  // Fire exactly once per fill - the shared rule, because <OtpField> needs the
  // same one and a code submitted twice is a lockout.
  const report = useCompleteOnce(length, onComplete);
  useEffect(() => report(value), [value, report]);

  // Hardware keyboard: type the code, edit with Delete/Backspace. Digits are
  // not remote keys, so this cannot collide with D-pad navigation. Refs carry
  // the changing state so the listener subscribes once.
  const state = useRef({ value, length, disabled, setValue });
  state.current = { value, length, disabled, setValue };
  useEffect(() => {
    const w = physicalKeyboard ? webWindow() : null;
    if (!w) return;
    const onKey = (event: KeyboardEvent) => {
      const { value: current, length: max, disabled: locked, setValue: set } = state.current;
      if (locked) return;
      if (/^\d$/.test(event.key)) {
        if (current.length < max) set(current + event.key);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        set(current.slice(0, -1));
      }
    };
    w.addEventListener('keydown', onKey);
    return () => w.removeEventListener('keydown', onKey);
  }, [physicalKeyboard]);

  return (
    <Box row gap={18} opacity={disabled ? 0.6 : 1} {...box}>
      {Array.from({ length }, (_, at) => `pin-dot-${at}`).map((key, at) => {
        const filled = at < value.length;
        return (
          <Box
            key={key}
            w={dot}
            h={dot}
            radius="pill"
            borderWidth={2}
            bg={filled ? colors.accent : 'transparent'}
            border={dotEdge(filled, error)}
          />
        );
      })}
    </Box>
  );
}

/** A dot's edge: amber once entered, red while the code stands rejected, and
 * otherwise the faint outline of a slot still waiting for a digit. */
function dotEdge(filled: boolean, error: boolean): string {
  if (filled) return colors.accent;
  return error ? colors.danger : 'rgba(255, 255, 255, 0.25)';
}

export type { PinFieldProps };
export { PinField };
