import type { DirectPlatform } from '@kromatv/ui';

// expo-network is a native module; binaries built before it exists must not
// crash at import time, hence the guarded lazy require (as in ./localIp).
function onNetworkChange(listener: () => void): () => void {
  try {
    const net: typeof import('expo-network') = require('expo-network');
    const subscription = net.addNetworkStateListener(() => listener());
    return () => subscription.remove();
  } catch {
    return () => undefined;
  }
}

/** This phone's network as the direct route watches it: wifi to cellular, a
 * new access point. */
export const PHONE_NETWORK: DirectPlatform = { onNetworkChange };
