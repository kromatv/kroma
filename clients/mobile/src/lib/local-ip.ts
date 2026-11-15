// This device's LAN IPv4 for subnet-scan discovery. expo-network is a native
// module; binaries built before it exists must not crash at import time
// (expo-router loads every route at boot), hence the guarded lazy require.

function localIpProvider(): (() => Promise<string | null>) | null {
  try {
    const net: typeof import('expo-network') = require('expo-network');
    return async () => {
      try {
        const ip = await net.getIpAddressAsync();
        return ip && ip !== '0.0.0.0' ? ip : null;
      } catch {
        return null;
      }
    };
  } catch {
    return null;
  }
}

const provider = localIpProvider();

export async function getDeviceLocalIp(): Promise<string | null> {
  return provider ? provider() : null;
}
