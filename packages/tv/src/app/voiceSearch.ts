// Voice search: the design lives here, the microphone does not.
//
// A backend is a television that can actually HEAR: it takes the microphone,
// and it hands back words. Android TV can (the remote's mic, through
// `SpeechRecognizer`); nothing else here can today.
//
// Apple TV in particular cannot, and the reason is worth writing down because it
// looks like a bug that could be fixed: tvOS has no microphone API for
// third-party apps at all. The Siri Remote's mic belongs to the system. The only
// speech a tvOS app ever receives is dictation into one of the platform's own
// text fields, and a mic button of ours cannot start that - the user holds the
// Siri button, and only while a system field has focus. So Apple TV registers no
// backend here and the mic button does not exist there. It still dictates: the
// search screen adopts the platform's own field and keyboard through
// `app/searchShell`, which is where that speech actually arrives.
//
// The shared search screen owns everything visible (the mic button, the panel,
// the live transcript feeding the same debounced query); a shell registers the
// half only it can implement. No backend registered, no mic button: a capability
// that is absent must not be advertised on a television where the user has no
// way to find out why nothing happened.
//
// Registration is dependency injection, exactly like <Img>'s image backend: the
// bundler never has to reason about a native module a target does not install.

import type { ComponentType } from 'react';

export interface VoiceSessionProps {
  /** The transcript so far, as the platform reports it. Called repeatedly:
   * partial results are what makes the results grid fill in while talking. */
  onText: (text: string) => void;
  /** The session is over: a final result, a cancel, or a failure. The screen
   * closes the panel on this, so a backend MUST call it exactly once. */
  onDone: () => void;
  /** BCP-47 tag of the app's language, for recognisers that take a hint. */
  locale: string;
}

export interface VoiceSearchBackend {
  /** Cheap, synchronous probe, read on every render of the search screen. False
   * hides the mic button entirely (no native module, no permission, no mic). */
  available: () => boolean;
  /** Mounted while a session runs, and normally renders nothing: a recogniser is
   * invisible, and the panel around it is the whole interface. */
  Session: ComponentType<VoiceSessionProps>;
}

let current: VoiceSearchBackend | null = null;

/** Register the shell's voice backend. Call once at the app root, before the
 * first render. Passing null removes it (what a test does to get back to the
 * silent default). */
export function setVoiceSearchBackend(backend: VoiceSearchBackend | null): void {
  current = backend;
}

/** The registered backend, or null when there is none or it reports itself
 * unavailable right now. A throwing probe counts as unavailable: a broken
 * capability check must not take the search screen down with it. */
export function voiceSearchBackend(): VoiceSearchBackend | null {
  if (!current) return null;
  try {
    return current.available() ? current : null;
  } catch {
    return null;
  }
}
