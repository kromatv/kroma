import { useEffect, useEffectEvent } from 'react';
import { type RemoteKey, resolveRemoteKey } from '#ui/lib/remote-keys';

const SKIP_KEYS: ReadonlySet<RemoteKey> = new Set<RemoteKey>(['Enter', 'Back', 'PlayPause']);
const SKIP_NAMES: ReadonlySet<string> = new Set(['GoBack', 'BrowserBack']);

function skips(e: KeyboardEvent): boolean {
  const remote = resolveRemoteKey(e);
  return (remote !== null && SKIP_KEYS.has(remote)) || SKIP_NAMES.has(e.key);
}

export interface IntroKeysParams {
  /** Skip to the app: OK/Enter, Space, Back/Escape. */
  exit: () => void;
  /** Restart the run from frame 0 (the `r` key, for tuning the choreography). */
  replay: () => void;
  /** First pointer/key of the session. Browsers block autoplay-with-sound until
   * a user gesture, so this is where each intro un-blocks its own audio. */
  unblock: () => void;
}

/**
 * The intro's input layer: the skip / replay keys plus the autoplay-unblock
 * gesture, registered once for the life of the intro.
 *
 * Skip keys are taken on the capture phase at `window` so the TV's spatial
 * focus-nav underneath stays inert, and `stopImmediatePropagation` means a skip
 * key never also reaches `unblock` (skipping must not restart anything).
 * One stable pair of listeners calls the latest closures.
 */
export function useIntroKeys({ exit, replay, unblock }: IntroKeysParams): void {
  const onGesture = useEffectEvent(unblock);

  // Skip / replay via keyboard + TV remote (OK/Enter, Space, Back/Escape).
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (skips(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      exit();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      e.stopImmediatePropagation();
      replay();
    }
  });

  useEffect(() => {
    document.addEventListener('pointerdown', onGesture);
    document.addEventListener('keydown', onGesture);
    // Capture phase so the TV's spatial focus-nav underneath stays inert.
    window.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('pointerdown', onGesture);
      document.removeEventListener('keydown', onGesture);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);
}
