import { MicButton } from '@kromatv/react-native-tv/tizen/mic-button';
import type { VoiceSearchBackend, VoiceSessionProps } from '@kromatv/tv';
import { ExpoSpeechRecognitionModule as Speech } from 'expo-speech-recognition';
import { useEffect, useRef } from 'react';

interface Listener {
  onText: (text: string) => void;
  onDone: () => void;
}

function createTalk() {
  const listeners = new Set<Listener>();
  const state = { active: false, text: '' };
  return {
    get active() {
      return state.active;
    },
    get text() {
      return state.text;
    },
    begin(): boolean {
      if (state.active) return false;
      state.active = true;
      state.text = '';
      return true;
    },
    hear(text: string) {
      if (!state.active || !text) return;
      state.text = text;
      for (const listener of listeners) listener.onText(text);
    },
    end() {
      if (!state.active) return;
      state.active = false;
      for (const listener of listeners) listener.onDone();
    },
    listen(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const talk = createTalk();

Speech.addListener('result', (event) => talk.hear(event.results[0]?.transcript ?? ''));
Speech.addListener('end', () => talk.end());

function listen() {
  if (talk.begin()) Speech.start({ interimResults: true });
}

function TalkSession({ onText, onDone }: Readonly<VoiceSessionProps>) {
  const handlers = useRef({ onText, onDone });
  useEffect(() => {
    handlers.current = { onText, onDone };
  });

  useEffect(() => {
    const stop = talk.listen({
      onText: (text) => handlers.current.onText(text),
      onDone: () => handlers.current.onDone(),
    });
    if (!talk.active) listen();
    else if (talk.text) handlers.current.onText(talk.text);
    return () => {
      stop();
      if (talk.active) Speech.abort();
    };
  }, []);

  return null;
}

const tizenVoiceSearch: VoiceSearchBackend = {
  available: () => Speech.isRecognitionAvailable(),
  Session: TalkSession,
};

/** Tizen's speech recogniser, which hears the Smart Remote's microphone while its button is held. */
export const nativeVoiceSearch: VoiceSearchBackend | null = tizenVoiceSearch;

/** Holds the remote's mic button: down starts listening and calls `onHold`, up stops and keeps what was heard. */
export function useVoiceKey(onHold: () => void): void {
  const latest = useRef(onHold);
  useEffect(() => {
    latest.current = onHold;
  });

  useEffect(() => {
    const pressIn = MicButton.addListener('pressIn', () => {
      listen();
      latest.current();
    });
    const pressOut = MicButton.addListener('pressOut', () => {
      if (talk.active) Speech.stop();
    });
    return () => {
      pressIn.remove();
      pressOut.remove();
    };
  }, []);
}
