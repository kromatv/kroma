// "The code is complete" - fired exactly once per fill.
//
// Every fixed-length field in the kit submits the moment the last character
// lands, and every one of them has to solve the same problem: a re-render with
// the same full buffer (the parent flipping `busy`, a surface change, a theme
// swap) must not resubmit. The rule is "arm on falling below the length, fire on
// first reaching it", and it was written out in both <OtpField> and <PinField>
// with a ref of the same name - so a fix to one would have left the other
// double-submitting an emailed code.

import { useCallback, useRef } from 'react';

/**
 * Returns a stable `report(value)`. Call it whenever the buffer changes - from
 * an event handler, or from an effect keyed on the value - and it fires
 * `onComplete` on the transition into a full buffer and never again until the
 * buffer drops back below `length`.
 *
 * `length` and `onComplete` are read through a ref rather than closed over, so
 * the returned function keeps one identity for the field's lifetime: an effect
 * that depends on it does not re-run every time the parent re-renders with a
 * fresh callback.
 */
export function useCompleteOnce(
  length: number,
  onComplete?: (value: string) => void,
): (value: string) => void {
  const completed = useRef(false);
  const latest = useRef({ length, onComplete });
  latest.current = { length, onComplete };

  return useCallback((value: string) => {
    const { length: max, onComplete: fire } = latest.current;
    if (value.length < max) {
      completed.current = false;
      return;
    }
    if (completed.current) return;
    completed.current = true;
    fire?.(value);
  }, []);
}
