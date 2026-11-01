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

/** Binds a list's keyboard cursor on the capture phase; returns the cursor where the platform draws one. */
function useListCursorKeys<T>({
  onStep,
  onChoose,
  onClose,
  cursor,
}: ListCursorKeysOptions<T>): T | undefined {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.isComposing || !(event.key in STEP)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') return onClose();
    if (event.key === 'Enter') return onChoose(event.metaKey || event.ctrlKey);
    onStep(STEP[event.key] as number);
  });

  useEffect(() => {
    const document = webDocument();
    if (!document) return;
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.stopPropagation();
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
