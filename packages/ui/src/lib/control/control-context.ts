import { createContext, useContext } from 'react';
import type { ControlEngine } from './control-engine';

const Context = createContext<ControlEngine | null>(null);

export const ControlEngineProvider = Context.Provider;

/** The engine of the nearest `KitProvider`, or null outside one. */
export const useControlEngine = () => useContext(Context);
