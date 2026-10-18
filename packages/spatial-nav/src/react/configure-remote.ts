import type { Direction } from '@kromatv/spatial-nav';
import { createContext, useContext } from 'react';
export type RemoteHandler = (direction: Direction) => void;
export interface RemoteConfig {
  subscribe(handle: RemoteHandler): () => void;
}
const Context = createContext<RemoteConfig | null>(null);
export const RemoteProvider = Context.Provider;
export const useRemoteConfig = () => useContext(Context);
