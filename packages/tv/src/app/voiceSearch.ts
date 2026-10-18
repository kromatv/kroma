// Voice search: the design lives here, the microphone does not. A shell
// registers a backend only if its television can actually hear; no backend
// registered means no mic button. tvOS has no third-party microphone API at
// all (the Siri Remote's mic only feeds dictation into a system text field),
// so Apple TV registers none here and dictates through `app/searchShell` instead.

import { type ComponentType, createContext, useContext } from 'react';

export interface VoiceSessionProps {
  onText: (text: string) => void;
  onDone: () => void;
  locale: string;
}

export interface VoiceSearchBackend {
  available: () => boolean;
  Session: ComponentType<VoiceSessionProps>;
}

const Context = createContext<VoiceSearchBackend | null>(null);
export const VoiceSearchProvider = Context.Provider;

/** Read the capability injected by this app root. */
export function useVoiceSearchBackend(): VoiceSearchBackend | null {
  return voiceSearchBackend(useContext(Context));
}

/** Null when unregistered or its probe reports unavailable; a throwing probe
 * also counts as unavailable rather than taking the search screen down. */
export function voiceSearchBackend(
  current: VoiceSearchBackend | null = null,
): VoiceSearchBackend | null {
  if (!current) return null;
  try {
    return current.available() ? current : null;
  } catch {
    return null;
  }
}
