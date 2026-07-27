// JS face of the local Apple TV Siri module.
//
// Optional, like the Android voice module: this one is declared for Apple only,
// so on an Android TV build it is absent and asking for it must return null
// rather than throw.

import { type NativeModule, requireOptionalNativeModule } from 'expo';

export type SiriSearchEvents = {
  /** Siri understood a media request while the app was running. */
  query: (event: { text: string }) => void;
};

declare class SiriSearchNativeModule extends NativeModule<SiriSearchEvents> {
  /** The query Siri left before JavaScript was running (it launched the app to
   * handle the request), or null. Reading it clears it. */
  takePendingQuery(): string | null;
}

/** The native module, or null on a platform that does not ship it. */
export const SiriSearch = requireOptionalNativeModule<SiriSearchNativeModule>('SiriSearch');
