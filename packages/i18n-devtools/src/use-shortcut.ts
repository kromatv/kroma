import { useEffect, useRef } from 'react';
import { isChord, isEditableTarget, type Shortcut } from './shortcut';

export function useShortcut(shortcuts: readonly Shortcut[], onDismiss?: () => void): void {
  const latest = useRef({ shortcuts, onDismiss });
  latest.current = { shortcuts, onDismiss };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === 'Escape') {
        latest.current.onDismiss?.();
        return;
      }
      if (isEditableTarget(event.target)) return;
      const hit = latest.current.shortcuts.find((shortcut) => isChord(event, shortcut.code));
      if (!hit) return;
      event.preventDefault();
      hit.run();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
