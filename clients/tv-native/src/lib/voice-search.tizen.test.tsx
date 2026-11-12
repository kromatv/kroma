// @vitest-environment jsdom

import { cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const speech = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown) => void>();
  return {
    handlers,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    isRecognitionAvailable: vi.fn(() => true),
    addListener(name: string, handler: (event: unknown) => void) {
      handlers.set(name, handler);
      return { remove: () => handlers.delete(name) };
    },
  };
});

const mic = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();
  return {
    handlers,
    MicButton: {
      addListener(event: string, listener: () => void) {
        handlers.set(event, listener);
        return { remove: () => handlers.delete(event) };
      },
    },
  };
});

vi.mock('expo-speech-recognition', () => ({ ExpoSpeechRecognitionModule: speech }));
vi.mock('@kromatv/react-native-tizen/mic-button', () => ({ MicButton: mic.MicButton }));

async function load() {
  vi.resetModules();
  return import('./voice-search.tizen');
}

function heard(transcript: string) {
  speech.handlers.get('result')?.({ isFinal: false, results: [{ transcript }] });
}

function ended() {
  speech.handlers.get('end')?.(null);
}

function press(event: 'pressIn' | 'pressOut') {
  mic.handlers.get(event)?.();
}

beforeEach(() => {
  vi.clearAllMocks();
  speech.handlers.clear();
  mic.handlers.clear();
});

afterEach(cleanup);

describe('Tizen voice search', () => {
  it('starts listening when the mic button goes down and stops when it comes up', async () => {
    const { useVoiceKey } = await load();
    const onHold = vi.fn();
    renderHook(() => useVoiceKey(onHold));

    press('pressIn');
    press('pressOut');

    expect(speech.start).toHaveBeenCalledWith({ interimResults: true });
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(speech.stop).toHaveBeenCalledTimes(1);
  });

  it('shows the words heard before the panel opened, then each new one, and closes at the end', async () => {
    const { useVoiceKey, nativeVoiceSearch } = await load();
    renderHook(() => useVoiceKey(() => undefined));
    const onText = vi.fn();
    const onDone = vi.fn();

    press('pressIn');
    heard('du');
    const Session = nativeVoiceSearch?.Session;
    if (!Session) throw new Error('no voice backend');
    const panel = render(<Session onText={onText} onDone={onDone} locale="fr" />);
    heard('dune');
    ended();
    panel.unmount();

    expect(onText.mock.calls).toEqual([['du'], ['dune']]);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(speech.start).toHaveBeenCalledTimes(1);
    expect(speech.abort).not.toHaveBeenCalled();
  });

  it('listens when the panel opens on its own and aborts when it closes early', async () => {
    const { nativeVoiceSearch } = await load();
    const Session = nativeVoiceSearch?.Session;
    if (!Session) throw new Error('no voice backend');

    const panel = render(<Session onText={() => undefined} onDone={() => undefined} locale="fr" />);
    panel.unmount();

    expect(speech.start).toHaveBeenCalledTimes(1);
    expect(speech.abort).toHaveBeenCalledTimes(1);
  });

  it('ignores a release with nothing to stop and a second press while listening', async () => {
    const { useVoiceKey } = await load();
    renderHook(() => useVoiceKey(() => undefined));

    press('pressOut');
    press('pressIn');
    press('pressIn');

    expect(speech.stop).not.toHaveBeenCalled();
    expect(speech.start).toHaveBeenCalledTimes(1);
  });

  it('is available when the TV can recognize speech', async () => {
    const { nativeVoiceSearch } = await load();
    speech.isRecognitionAvailable.mockReturnValue(false);

    expect(nativeVoiceSearch?.available()).toBe(false);
  });
});
