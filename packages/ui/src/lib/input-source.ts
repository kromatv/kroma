// Which input is driving right now: a pointer sweeping the page, or keys
// walking it.
//
// The reveal scrollers (lib/focus-scroll) ask at focus time. A control the
// pointer just entered is already under the viewer's eyes, so scrolling it to
// the pin line yanks the page out from under a cursor that has not moved - at
// the screen's bottom edge this CASCADES, since the scroll parks a new control
// under the pointer, which focuses and scrolls in turn. So the wheel counts as
// the pointer too, and any key press re-arms the reveal.
//
// Host-owned listeners, web only: on a television there is no pointer and
// this stays permanently false, which is the D-pad behaviour unchanged.

import { createContext, useContext, useEffect, useState } from 'react';
import { webWindow } from './dom';

/** Pointer modality and its listeners have the same lifetime as their host. */
export function createInputSource() {
  let pointerDrove = false;
  let holds = 0;
  let stop = () => {};
  return {
    pointerDriving: () => pointerDrove,
    retain() {
      holds += 1;
      if (holds === 1) {
        const win = webWindow();
        const pointer = () => {
          pointerDrove = true;
        };
        const keys = () => {
          pointerDrove = false;
        };
        const pointerOptions = { capture: true, passive: true };
        for (const kind of ['mousemove', 'wheel', 'pointerdown'])
          win?.addEventListener(kind, pointer, pointerOptions);
        win?.addEventListener('keydown', keys, true);
        stop = () => {
          for (const kind of ['mousemove', 'wheel', 'pointerdown'])
            win?.removeEventListener(kind, pointer, true);
          win?.removeEventListener('keydown', keys, true);
        };
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds -= 1;
        if (holds === 0) {
          stop();
          pointerDrove = false;
        }
      };
    },
  };
}
const Context = createContext<ReturnType<typeof createInputSource> | null>(null);
export const InputSourceProvider = Context.Provider;
export const useInputSourceParent = () => useContext(Context);
export function usePointerDriving(): () => boolean {
  const parent = useContext(Context);
  const [owned] = useState(() => (parent ? null : createInputSource()));
  const source = parent ?? owned;
  if (!source) throw new Error('Input source requires its owning root');
  useEffect(() => (parent ? undefined : source.retain()), [parent, source]);
  return source.pointerDriving;
}
