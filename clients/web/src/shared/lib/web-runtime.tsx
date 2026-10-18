import { createContext, type ReactNode, useContext } from 'react';
import type { WebRuntime } from './api';

const Context = createContext<WebRuntime | null>(null);
export function WebRuntimeProvider({
  value,
  children,
}: Readonly<{ value: WebRuntime; children?: ReactNode }>) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** Root API state is shared by the router's loaders and the rendered auth tree. */
export function useWebRuntime(): WebRuntime {
  const runtime = useContext(Context);
  if (!runtime) throw new Error('WebRuntimeProvider is required');
  return runtime;
}
export function useKromaClient() {
  return useWebRuntime().client;
}
