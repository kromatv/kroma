import { createContext, useContext, useState } from 'react';
import { type ControlEngine, createControlEngine } from './control-engine';

const Context = createContext<ControlEngine | null>(null);

export const ControlEngineProvider = Context.Provider;

/** The engine of the nearest `KitProvider`, or null outside one. */
export const useControlEngine = () => useContext(Context);

/** The engine a `KitProvider` hands down: its parent's, or its own at the root. */
export function useProvidedControlEngine(): ControlEngine {
  const inherited = useContext(Context);
  const [owned] = useState(createControlEngine);
  return inherited ?? owned;
}
