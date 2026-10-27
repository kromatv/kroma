import { createContext, type ReactNode, useContext, useLayoutEffect, useRef } from 'react';

type PlaybackLease = { shutdown(): void };
type PlaybackOwner = { current: PlaybackLease | null };
const PlaybackContext = createContext<PlaybackOwner | null>(null);

export function PlaybackOwnerProvider({ children }: Readonly<{ children: ReactNode }>) {
  const ownerRef = useRef<PlaybackLease | null>(null);
  return <PlaybackContext value={ownerRef}>{children}</PlaybackContext>;
}

export function usePlaybackOwner(shutdown: () => void): void {
  const ownerRef = useContext(PlaybackContext);
  if (!ownerRef) throw new Error('The playback engine requires PlaybackOwnerProvider.');
  useLayoutEffect(() => {
    const lease = { shutdown };
    ownerRef.current?.shutdown();
    ownerRef.current = lease;
    return () => {
      shutdown();
      if (ownerRef.current === lease) ownerRef.current = null;
    };
  }, [ownerRef, shutdown]);
}
