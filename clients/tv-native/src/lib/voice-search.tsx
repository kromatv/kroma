// Android TV only: tvOS exposes no audio input to third-party code (the Siri
// Remote's mic is the system's, usable only as dictation into a focused field).

import type { VoiceSearchBackend, VoiceSessionProps } from '@kroma/tv';
import { useEffect, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { VoiceSearch } from '../../modules/voice-search';

// Cached: the search screen probes on every render, and the answer cannot change
// while the app runs.
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
      // Nothing heard, no network, no permission: end rather than leave a panel
      // that pulses forever.
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
      void mod.cancel().catch(() => {});
    };
  }, [locale]);

  return null;
}

const androidVoiceSearch: VoiceSearchBackend = {
  available: recogniserAvailable,
  Session: ListenSession,
};

/** Null on a platform with no microphone to offer, which is what removes the mic button. */
export const nativeVoiceSearch: VoiceSearchBackend | null =
  Platform.OS === 'android' ? androidVoiceSearch : null;
