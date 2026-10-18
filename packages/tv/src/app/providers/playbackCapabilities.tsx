import { capabilities, type DecoderFrameLimits, type PlaybackCapabilities } from '@kromatv/core';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

const Context = createContext<PlaybackCapabilities>(capabilities());
/** Decoder ceilings belong to this television, including its remounted player. */
export function PlaybackCapabilitiesProvider({
  limits,
  children,
}: {
  limits?: DecoderFrameLimits;
  children: ReactNode;
}) {
  const value = useMemo(
    () => (limits ? { ...capabilities(), frameLimits: limits } : capabilities()),
    [limits],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePlaybackCapabilities() {
  return useContext(Context);
}
