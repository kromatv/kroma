// Publishes KROMA's rows OUT to the television's home screen (Android TV Watch
// Next and preview channels, tvOS Top Shelf). With no backend registered (Tizen,
// webOS, desktop, web), both calls are silent no-ops. Payloads stay JSON strings
// so a provider's `lastPushed` guard can compare two of them with `===`.

import { createContext, useContext } from 'react';

export interface LauncherBackend {
  // JSON array of `{id,title,subtitle?,imageUrl?,backdropUrl?,progressMs,
  // durationMs,kind,showId?,updatedAtMs}`; `[]` clears it.
  setContinueWatching(json: string): void;
  // JSON array of `{title, items:[{id,title,subtitle?,imageUrl?,backdropUrl?,
  // kind}]}` in display order; `[]` clears them.
  setHomeChannel(json: string): void;
}

const Context = createContext<LauncherBackend | null>(null);
export const LauncherProvider = Context.Provider;

export function useLauncherBackend(): LauncherBackend | null {
  return useContext(Context);
}
