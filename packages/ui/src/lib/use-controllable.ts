// Controlled-or-uncontrolled state, the Radix/shadcn contract.
//
// Every form primitive in the kit accepts BOTH spellings: pass `value` (or
// `checked`) and you own the state, exactly as before; pass only a default and
// the component runs itself, which is what a quick screen, a story preview or
// a prototype wants. The rule is decided ONCE, from whether the controlled
// prop was present on first render, so a component cannot silently flip
// between modes as a value goes to undefined mid-flight.

import { useCallback, useRef, useState } from 'react';

export function useControllable<T>(
  controlled: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): [T, (next: T) => void] {
  // Mode is pinned at mount: React's own warning for flipping an input between
  // controlled and uncontrolled exists for good reason, and this is the same
  // reason.
  const mode = useRef(controlled !== undefined ? 'controlled' : 'uncontrolled').current;
  const [own, setOwn] = useState(defaultValue);
  const value = mode === 'controlled' ? (controlled as T) : own;

  const set = useCallback(
    (next: T) => {
      if (mode === 'uncontrolled') setOwn(next);
      onChange?.(next);
    },
    [mode, onChange],
  );

  return [value, set];
}
