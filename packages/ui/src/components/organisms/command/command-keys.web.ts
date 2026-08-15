// The palette's keys on the browser targets.
//
// Taken on the CAPTURE phase, for two reasons: react-native-web's TextInput
// stops propagation on keydown, so a bubbling listener is deaf while the search
// field is focused; and the spatial navigator listens on the bubble phase (see
// lib/focus-remote.web), so stopping the event here is what keeps a press that
// moved the cursor from also moving focus behind the palette.

import { useEffect, useEffectEvent } from 'react';
import { webDocument } from '#ui/lib/dom';
import { type CommandKeysOptions, PAGE } from './command-keys-types';

// Both spellings of the two directions: a television browser names them without
// the `Arrow` prefix. Enter and Escape sit here with a zero step so one lookup
// answers which keys the palette swallows.
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

function useCommandKeys({ onStep, onChoose, onClose }: CommandKeysOptions): void {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.key in STEP)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') return onClose();
    if (event.key === 'Enter') return onChoose();
    onStep(STEP[event.key] as number);
  });

  useEffect(() => {
    const document = webDocument();
    if (!document) return;
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
}

export { useCommandKeys };
