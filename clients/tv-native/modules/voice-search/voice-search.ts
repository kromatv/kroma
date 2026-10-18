// JS face of the local Android TV voice module.

import { type NativeModule, requireOptionalNativeModule } from 'expo';

export type VoiceSearchEvents = {
  partial: (event: { text: string }) => void;
  result: (event: { text: string }) => void;
  // An `android.speech.SpeechRecognizer` ERROR_* code. Also ends the session.
  error: (event: { code: number }) => void;
};

declare class VoiceSearchNativeModule extends NativeModule<VoiceSearchEvents> {
  isAvailable(): boolean;
  // `locale` is a BCP-47 tag, e.g. "fr-FR".
  start(locale: string): Promise<void>;
  // Stop listening and keep what was heard (a final `result` follows).
  stop(): Promise<void>;
  cancel(): Promise<void>;
}

/** Null on a platform that does not ship it (Apple TV); that null is the
 * capability check the shell's backend reads. */
export const VoiceSearch = requireOptionalNativeModule<VoiceSearchNativeModule>('VoiceSearch');
