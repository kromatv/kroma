// Voice search, the platform half. Android TV only, and that is the finding
// rather than an omission.
//
// Android TV lends an app the remote's microphone: the local `voice-search`
// module drives `android.speech.SpeechRecognizer`, words arrive as partial
// results, and the results grid fills in mid-sentence.
//
// **Apple TV has no microphone for apps.** Not a missing permission, not a
// module to write: tvOS exposes no audio input to third-party code at all, and
// the Siri Remote's mic is the system's. The one crack is dictation into a
// platform text field, which no button of ours can start: the user holds the
// Siri button, and it only listens while a system field has focus. So Apple TV
// registers no backend here and the mic button does not exist there.
//
// It does dictate, though, and that is what `native-search` is for: the search
// screen adopts the platform's own field and keyboard on this device, which is
// the arrangement every tvOS media app uses and the only one those words reach.
// The other way in is Siri itself, through the media intents in `siri-search`.

import type { VoiceSearchBackend, VoiceSessionProps } from '@kroma/tv';
import { useEffect, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { VoiceSearch } from '../../modules/voice-search';

// ----- Android TV: the app listens ---------------------------------------------

/** Cached: the availability probe is read on every render of the search screen,
 * and it is a bind-to-a-service question whose answer does not change while the
 * app runs. */
let recogniserReady: boolean | null = null;

function recogniserAvailable(): boolean {
  if (recogniserReady === null) {
    try {
      recogniserReady = VoiceSearch?.isAvailable() ?? false;
    } catch {
      recogniserReady = false;
    }
  }
  return recogniserReady;
}

/** Invisible: the panel around it is the entire UI. This only runs the
 * recogniser for as long as it is mounted, and hands back every transcript. */
function ListenSession({ onText, onDone, locale }: Readonly<VoiceSessionProps>) {
  // The screen re-renders on every partial result, which would otherwise tear
  // the session down and start a new one on each word.
  const handlers = useRef({ onText, onDone });
  handlers.current = { onText, onDone };

  useEffect(() => {
    const mod = VoiceSearch;
    if (!mod) {
      handlers.current.onDone();
      return;
    }
    let live = true;
    const finish = () => {
      if (!live) return;
      live = false;
      handlers.current.onDone();
    };
    const subs = [
      mod.addListener('partial', ({ text }) => handlers.current.onText(text)),
      mod.addListener('result', ({ text }) => {
        if (text) handlers.current.onText(text);
        finish();
      }),
      // Nothing heard, no network, no permission: end the session rather than
      // leaving a panel that pulses forever.
      mod.addListener('error', finish),
    ];

    void (async () => {
      // RECORD_AUDIO is a runtime permission even on a television.
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ).catch(() => null);
      if (!live) return;
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        finish();
        return;
      }
      try {
        await mod.start(locale);
      } catch {
        finish();
      }
    })();

    return () => {
      live = false;
      for (const sub of subs) sub.remove();
      // Unmounting means the user left: drop the sentence and free the mic.
      void mod.cancel().catch(() => {});
    };
  }, [locale]);

  return null;
}

/** The only television here that can hear. */
const androidVoiceSearch: VoiceSearchBackend = {
  available: recogniserAvailable,
  Session: ListenSession,
};

/** The backend for whichever television this build is running on, or null on the
 * one that has no microphone to offer. Null is what removes the mic button. */
export const nativeVoiceSearch: VoiceSearchBackend | null =
  Platform.OS === 'android' ? androidVoiceSearch : null;
