import { useEffect, useEffectEvent } from 'react';
import { webDocument } from './dom';
import { type ListCursorKeysOptions, PAGE } from './list-cursor-keys-types';

const STEP: Record<string, number> = {
  ArrowUp: -1,
  ArrowDown: 1,
  Up: -1,
  Down: 1,
  PageUp: -PAGE,
  PageDown: PAGE,
  Enter: 0,
  Escape: 0,
};

function handled(event: KeyboardEvent, onBack: (() => void) | undefined): boolean {
  if (event.isComposing) {
    return false;
  }
  return event.key in STEP || (event.key === 'Backspace' && onBack !== undefined);
}

/** Binds a list's keyboard cursor on the capture phase; returns the cursor where the platform draws one. */
function useListCursorKeys<T>({
  onStep,
  onChoose,
  onClose,
  onBack,
  cursor,
}: ListCursorKeysOptions<T>): T | undefined {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (!handled(event, onBack)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      return onClose();
    }
    if (event.key === 'Backspace') {
      return onBack?.();
    }
    if (event.key === 'Enter') {
      return onChoose(event.metaKey || event.ctrlKey);
    }
    onStep(STEP[event.key] as number);
  });

  useEffect(() => {
    const document = webDocument();
    if (!document) {
      return undefined;
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKeyUp, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('keyup', onKeyUp, true);
    };
  }, []);

  return cursor;
}

export { useListCursorKeys };
