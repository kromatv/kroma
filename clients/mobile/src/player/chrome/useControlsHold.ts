import { useEffect, useRef } from 'react';

/** One hold on the player's controls, taken by `take` and given back by `give`,
 * or when the caller unmounts, so a touch that ends out of order never leaves
 * the controls pinned up. Taking it twice holds once. */
export function useControlsHold(hold: (() => () => void) | undefined): {
  take(): void;
  give(): void;
} {
  const release = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      release.current?.();
      release.current = null;
    },
    [],
  );

  return {
    take: () => {
      if (!release.current && hold) release.current = hold();
    },
    give: () => {
      release.current?.();
      release.current = null;
    },
  };
}
