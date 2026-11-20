// What an LG television says about reaching itself.
//
// The app is a browser, which can read neither its hardware address nor its
// address on the network, so both are asked of the JS Service packaged beside
// it (src/network-service.ts). The id the app is installed under is the one
// its control service launches it by.

import { z } from 'zod';

const SERVICE = 'luna://tv.kroma.webos.service/network';
// Longer than any answer to this question, and read before the JSON is.
const MAX_REPLY = 1024;

interface Bridge {
  onservicecallback: ((message: string) => void) | null;
  call(uri: string, payload: string): void;
}

declare const PalmServiceBridge: (new () => Bridge) | undefined;
declare const PalmSystem: { identifier?: string } | undefined;

// A browser has neither global, and reading a name that was never declared
// throws there.
function platform<T>(read: () => T | undefined): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

const Link = z.object({ address: z.string(), mac: z.string() });

// The bus holds no reference this side of the boundary: a bridge left in a
// function local can be collected before its reply lands. Held until it answers.
const pending = new Set<Bridge>();

function readLink(message: string): z.infer<typeof Link> | null {
  if (message.length > MAX_REPLY) {
    return null;
  }
  try {
    const link = Link.safeParse(JSON.parse(message));
    return link.success ? link.data : null;
  } catch {
    return null;
  }
}

function askLink(): Promise<z.infer<typeof Link> | null> {
  const Bus = platform(() => PalmServiceBridge);
  if (!Bus) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const bridge = new Bus();
    pending.add(bridge);
    bridge.onservicecallback = (message) => {
      pending.delete(bridge);
      resolve(readLink(message));
    };
    bridge.call(SERVICE, '{}');
  });
}

// The platform writes the id alone on one firmware and follows it with the
// process number on another.
function appId(): string | undefined {
  return platform(() => PalmSystem?.identifier)?.split(' ')[0] || undefined;
}

/** The hardware address and the network address of the interface this set is
 * connected by, and the id this app is installed under. Safe in a browser,
 * where every source is missing. */
export async function webOsWakeHint(): Promise<unknown> {
  const link = await askLink();
  return { mac: link?.mac, address: link?.address, appId: appId() };
}
