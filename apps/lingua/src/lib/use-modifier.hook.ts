import { useSyncExternalStore } from 'react';
import { modifierLabel } from '#site/lib/editor-keys';

const unchanging = () => () => {};

/** How this machine spells the shortcut modifier: `⌘` on Apple hardware, `Ctrl` elsewhere and on the server. */
export function useModifier(): string {
  return useSyncExternalStore(
    unchanging,
    () => modifierLabel(navigator.platform || navigator.userAgent),
    () => 'Ctrl',
  );
}
