import { reactivePref } from '#tv/app/settings/store';

/** Opt-in: crash reports are sent to the connected server only when this is
 * `'on'`. Default `'off'` so the app collects nothing until the user asks. */
export const crashReportingPrefStore = reactivePref(
  'kroma:crash-reporting',
  ['off', 'on'] as const,
  'off',
);
