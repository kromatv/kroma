// What an LG television calls itself, asked of webOS's own bus.
//
// The name the owner set lives in the preferences service, under
// `com.webos.service.properties.deviceName` - the same string the set shows as
// its friendly name ("Salon", "webOS TV Reference Device"), not the model.
//
// Reached through `PalmServiceBridge` rather than `webOS.service.request`,
// because this shell is a Vite build with no vendor script: `webOSTV.js` is what
// defines the `webOS` global, and it is not loaded here. `PalmServiceBridge` is
// the bus underneath it and exists on the television regardless, so this needs
// nothing added to the page.
//
// The bus answers through a callback, so the answer lands after the app has
// mounted and the shell hands it over then (see `lateDeviceName`).

import { type DeviceNameSource, lateDeviceName } from '@kroma/tv';
import { z } from 'zod';

const SERVICE = 'luna://com.webos.service.preferences/systemProperties';
const DEVICE_NAME_KEY = 'com.webos.service.properties.deviceName';

interface Bridge {
  onservicecallback: ((message: string) => void) | null;
  call(uri: string, payload: string): void;
}

interface WebOsGlobals {
  PalmServiceBridge?: new () => Bridge;
  // Present only when a shell loaded webOSTV.js. Kept as a fallback because a
  // model still beats the word "webOS".
  webOS?: { deviceInfo?: (callback: (info: unknown) => void) => void };
}

// A reply from another process, so nothing about its shape is known until it is
// parsed. `{ returnValue: true, values: [ { "<key>": "Salon" } ] }`, with the
// flat shape tolerated because the bus has answered both ways across versions.
const NameRow = z.object({ [DEVICE_NAME_KEY]: z.string() });
const Reply = z.object({ values: z.array(z.unknown()) });
const DeviceInfo = z.object({ modelName: z.string() });

// Longer than any answer to a one-key query, and read before the JSON is.
const MAX_REPLY = 8192;

function readDeviceName(message: string): string | null {
  if (message.length > MAX_REPLY) return null;
  const body: unknown = JSON.parse(message);
  const reply = Reply.safeParse(body);
  for (const row of reply.success ? reply.data.values : [body]) {
    const named = NameRow.safeParse(row);
    if (named.success) return named.data[DEVICE_NAME_KEY];
  }
  return null;
}

// The bus holds no reference this side of the boundary: a bridge left in a
// function local can be collected before the reply lands, and the subscription
// dies with it, silently. Held until the callback runs.
const pending = new Set<Bridge>();

function askPreferences(globals: WebOsGlobals, found: (name: string) => void): boolean {
  const Bridge = globals.PalmServiceBridge;
  if (!Bridge) return false;
  const bridge = new Bridge();
  pending.add(bridge);
  bridge.onservicecallback = (message) => {
    pending.delete(bridge);
    try {
      const name = readDeviceName(message);
      if (name) found(name);
    } catch {
      /* a bus that answered with something else is a bus with nothing to say */
    }
  };
  // The documented payload is an ARRAY of key objects, not an object.
  bridge.call(`${SERVICE}/getSomeSysPropertiesObj`, JSON.stringify([{ key: DEVICE_NAME_KEY }]));
  return true;
}

function askDeviceInfo(globals: WebOsGlobals, found: (name: string) => void): void {
  globals.webOS?.deviceInfo?.((info) => {
    const parsed = DeviceInfo.safeParse(info);
    if (parsed.success) found(parsed.data.modelName);
  });
}

/** Ask the platform what it is called. Safe in a browser, where neither the
 * bridge nor `webOS` exists and the source answers null for the session. */
export function resolveWebOsDeviceName(): DeviceNameSource {
  const name = lateDeviceName();
  const globals = globalThis as unknown as WebOsGlobals;
  try {
    // Only fall back to the model when there is no bus to ask for the name.
    if (!askPreferences(globals, name.found)) askDeviceInfo(globals, name.found);
  } catch {
    /* absent on this firmware */
  }
  return name;
}
