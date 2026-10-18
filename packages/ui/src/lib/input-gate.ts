// The remote's off switch, for the moments something full-screen owns it.
//
// Native has no capture phase to stop a key on (`useTVEventHandler` is additive,
// and Select goes straight to whichever control holds focus), so an overlay
// HOLDS the input instead and the three places that turn a remote event into
// behaviour do nothing while it does. Counted, so two overlays cannot release
// each other's hold; releasing arms the press guard.

import { createContext, useContext, useState } from 'react';
import { createPressGuard } from './press-guard';

/** Shared by overlays, focus controls and remote bridges in one app tree. */
export function createInputGate() {
  const guard = createPressGuard();
  let holders = 0;
  return {
    ...guard,
    holdInput() {
      holders += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holders = Math.max(0, holders - 1);
        if (holders === 0) guard.armPressGuard();
      };
    },
    inputHeld: () => holders > 0,
    clearInputHolds() {
      holders = 0;
    },
  };
}
export type InputGate = ReturnType<typeof createInputGate>;
const Context = createContext<InputGate | null>(null);
export const InputGateProvider = Context.Provider;
export const useInputGateParent = () => useContext(Context);
export function useInputGate(): InputGate {
  const provided = useContext(Context);
  const [owned] = useState(() => (provided ? null : createInputGate()));
  const gate = provided ?? owned;
  if (!gate) throw new Error('Input gate requires its owning root');
  return gate;
}
