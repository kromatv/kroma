import type { SessionStorage } from '@kromatv/client';
import { useDeviceStore } from '@kromatv/ui/device-store';
import { createContext, useContext, useState } from 'react';
import { createCastReceiverPref } from '#tv/features/cast/castPref';
import { createCrashReportingPref } from './crashReportingPref';
import { createKeyboardLayoutPref } from './keyboardLayoutPref';
import { createPerfHudPref } from './settings/store';

/** All reactive device choices share their root's hydrated backend. */
export function createDevicePreferences(storage?: SessionStorage | null) {
  return {
    keyboard: createKeyboardLayoutPref(storage),
    perfHud: createPerfHudPref(storage),
    castReceiver: createCastReceiverPref(storage),
    crashReporting: createCrashReportingPref(storage),
  };
}
export type DevicePreferences = ReturnType<typeof createDevicePreferences>;
const Context = createContext<DevicePreferences | null>(null);
export const DevicePreferencesProvider = Context.Provider;
export function useDevicePreferences(): DevicePreferences {
  const provided = useContext(Context);
  const storage = useDeviceStore();
  const [owned] = useState(() => (provided ? null : createDevicePreferences(storage)));
  const preferences = provided ?? owned;
  if (!preferences) throw new Error('Device preferences require an owner');
  return preferences;
}
