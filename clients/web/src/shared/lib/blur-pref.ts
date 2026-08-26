// Whether glass surfaces blur what is behind them, on this device. A browser
// that composites `backdrop-filter` on the CPU pays for every frosted control on
// screen at once, and the plain fill underneath is what the design falls back to
// anyway.
//
// Device-local, like the engine override in features/playback/engine-pref: it is
// a property of the machine, not of the account, so it is not sent anywhere.

import { setFrostEnabled } from '@kroma/ui/kit';

const KEY = 'kroma:blur';

/** The saved choice for this device; blurred unless it was turned off. */
export function getBlurPref(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setBlurPref(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable, the switch still holds for this session */
  }
  setFrostEnabled(on);
}

/** Push the stored choice into the kit. Called at import, before the first
 *  paint, so a device that turned frost off never flashes it. */
export function applyBlurPref(): void {
  setFrostEnabled(getBlurPref());
}

applyBlurPref();
