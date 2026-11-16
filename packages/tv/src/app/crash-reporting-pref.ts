import type { SessionStorage } from '@kromatv/client';
import { reactivePref } from '#tv/app/settings/store';

/** Opt-in: crash reports are sent to the connected server only when this is
 * `'on'`. Default `'off'` so the app collects nothing until the user asks. */
export function createCrashReportingPref(storage?: SessionStorage | null) {
  return reactivePref('kroma:crash-reporting', ['off', 'on'] as const, 'off', storage);
}
