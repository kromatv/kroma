import { useEffect, useEffectEvent } from 'react';
import type { CropKeysOptions } from './crop-keys-types';
import { webDocument } from './dom';
import { armEscapeGuard } from './escape-guard';

type Step = -1 | 0 | 1;

const PANS: Record<string, readonly [Step, Step]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  Left: [-1, 0],
  Right: [1, 0],
  Up: [0, -1],
  Down: [0, 1],
};

const ZOOMS: Record<string, -1 | 1> = { '+': 1, '=': 1, '-': -1, _: -1 };

const RELEASES = new Set(['Enter', 'Escape', ' ', 'Backspace']);

/** Hands a held crop frame the arrows and the plus and minus keys, and gives them back on Enter, Escape or Back. */
export function useCropKeys({ held, onPan, onZoom, onRelease }: CropKeysOptions): void {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const pan = PANS[event.key];
    const zoom = ZOOMS[event.key];
    if (!pan && !zoom && !RELEASES.has(event.key)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (pan) {
      onPan(pan[0], pan[1]);
    } else if (zoom) {
      onZoom(zoom);
    } else {
      if (event.key === 'Escape') {
        armEscapeGuard();
      }
      onRelease();
    }
  });

  useEffect(() => {
    const document = webDocument();
    if (!held || !document) {
      return undefined;
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [held]);
}
