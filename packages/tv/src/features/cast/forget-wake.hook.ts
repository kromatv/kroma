import type { DeviceId, KromaClient } from '@kromatv/client';
import { useEffect } from 'react';

interface ForgetWakeOptions {
  client: KromaClient;
  deviceId: () => DeviceId;
  signedIn: boolean;
  castable: string;
}

/** A set that does not allow control from another device is not listed at all,
 * on or off: what the server kept to bring it back by is dropped. */
export function useForgetWake({ client, deviceId, signedIn, castable }: ForgetWakeOptions) {
  useEffect(() => {
    if (signedIn && castable === 'off') {
      client.cast.forgetWake(deviceId()).catch(() => undefined);
    }
  }, [signedIn, castable, client, deviceId]);
}
