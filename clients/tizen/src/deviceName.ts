// What a Samsung television calls itself, asked of Tizen's own APIs.
//
// Ordered best first, and every one of them is optional: these APIs differ by
// firmware and by model, `webapis` is absent entirely in a browser (which is
// where this shell is developed), and a missing one must cost nothing. So each
// is read through a narrow view of `globalThis` and guarded.
//
// `webapis.network.getTVName()` is the one that matters: Samsung documents it as
// "the device's configured name when device is connected to a network", which is
// the name in Settings and the one the set already announces to AirPlay and
// Smart View. That is what a person recognises in a list of televisions.
//
// The model calls behind it are the fallback for a firmware that does not carry
// the network API: "The Frame" still beats "Tizen".

import { type DeviceNameSource, lateDeviceName } from '@kroma/tv';
import { z } from 'zod';

interface TizenGlobals {
  webapis?: {
    network?: {
      /** The name configured for this set, per Samsung's Network API. */
      getTVName?: () => string;
    };
    productinfo?: {
      getRealModel?: () => string;
      getModelCode?: () => string;
    };
  };
  tizen?: {
    systeminfo?: {
      getCapability?: (key: string) => unknown;
      getPropertyValue?: (
        property: string,
        onSuccess: (value: unknown) => void,
        onError?: (error: unknown) => void,
      ) => void;
    };
  };
}

// Whatever the systeminfo bus hands over crosses a process boundary, and the
// synchronous calls are only typed by the declarations above.
const Name = z.string().trim().min(1);
const Build = z.object({ model: Name });

function view(): TizenGlobals {
  return globalThis as unknown as TizenGlobals;
}

function firstName(...candidates: Array<() => unknown>): string | null {
  for (const read of candidates) {
    try {
      const parsed = Name.safeParse(read());
      if (parsed.success) return parsed.data;
    } catch {
      /* absent on this firmware */
    }
  }
  return null;
}

// Synchronous sources, best first: the owner's name, then the model.
function readSync(): string | null {
  const { webapis, tizen } = view();
  return firstName(
    () => webapis?.network?.getTVName?.(),
    () => webapis?.productinfo?.getRealModel?.(),
    () => tizen?.systeminfo?.getCapability?.('http://tizen.org/system/model_name'),
  );
}

// `BUILD` carries the friendliest model string of the three, and is the only
// one that arrives asynchronously.
function readBuild(found: (name: string) => void): void {
  const { tizen } = view();
  try {
    tizen?.systeminfo?.getPropertyValue?.(
      'BUILD',
      (value) => {
        const build = Build.safeParse(value);
        if (build.success) found(build.data.model);
      },
      () => undefined,
    );
  } catch {
    /* absent on this firmware */
  }
}

/** Ask the platform what it is called. Safe to call in a browser, where every
 * source is missing and the source answers null for the session. */
export function resolveTizenDeviceName(): DeviceNameSource {
  const name = lateDeviceName();
  const sync = readSync();
  if (sync) name.found(sync);
  else readBuild(name.found);
  return name;
}
