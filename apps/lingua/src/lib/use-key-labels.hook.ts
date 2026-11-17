import { useSyncExternalStore } from 'react';
import { type KeyLabels, keyLabels, PC_KEYS } from '#site/lib/editor-keys';

const unchanging = () => () => {};

/** How this machine's keyboard prints the shortcut modifiers: `⌘` and `⌥` on Apple hardware, `Ctrl` and `Alt` elsewhere and on the server. */
export function useKeyLabels(): KeyLabels {
  return useSyncExternalStore(
    unchanging,
    () => keyLabels(navigator.platform || navigator.userAgent),
    () => PC_KEYS,
  );
}
