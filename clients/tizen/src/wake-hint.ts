import { getLocalIPv4 } from '@kromatv/core';

declare const webapis: { network?: { getMac?: () => string } } | undefined;
declare const tizen:
  | { application?: { getCurrentApplication?: () => { appInfo?: { id?: string } } } }
  | undefined;

function read(call: () => string | undefined): string | undefined {
  try {
    return call() || undefined;
  } catch {
    return undefined;
  }
}

/** What a Samsung set says about reaching itself: the hardware address of the
 * interface it is connected by, its address on the network, and the id this app
 * is installed under. Safe in a browser, where every source is missing. */
export async function tizenWakeHint(): Promise<unknown> {
  return {
    mac: read(() => webapis?.network?.getMac?.()),
    appId: read(() => tizen?.application?.getCurrentApplication?.().appInfo?.id),
    address: (await getLocalIPv4()) ?? undefined,
  };
}
