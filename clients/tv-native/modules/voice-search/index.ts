// JS face of the local Android TV voice module.
//
// `requireOptionalNativeModule` rather than `requireNativeModule`: this module is
// declared for Android only, so on Apple TV it is genuinely absent and asking
// for it must return null instead of throwing. That null IS the capability
// check the shell's backend reads.

import { type NativeModule, requireOptionalNativeModule } from 'expo';

export type VoiceSearchEvents = {
  /** A transcription that may still change: emitted while the user talks. */
  partial: (event: { text: string }) => void;
  /** The final transcription. The session is over when this arrives. */
  result: (event: { text: string }) => void;
  /** An `android.speech.SpeechRecognizer` ERROR_* code. Also ends the session. */
  error: (event: { code: number }) => void;
};

declare class VoiceSearchNativeModule extends NativeModule<VoiceSearchEvents> {
  /** False when the device has no recognition service at all. */
  isAvailable(): boolean;
  /** Begin listening. `locale` is a BCP-47 tag, e.g. "fr-FR". */
  start(locale: string): Promise<void>;
  /** Stop listening and keep what was heard (a final `result` follows). */
  stop(): Promise<void>;
  /** Abandon the session with no result. */
  cancel(): Promise<void>;
}

/** The native module, or null on a platform that does not ship it (Apple TV). */
export const VoiceSearch = requireOptionalNativeModule<VoiceSearchNativeModule>('VoiceSearch');
