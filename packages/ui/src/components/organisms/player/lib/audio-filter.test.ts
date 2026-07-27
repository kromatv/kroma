// @vitest-environment jsdom
//
// The volume normalizer (§7): a Web Audio compressor behind the player's
// <video>, so it works on every playback mode including direct play.
//
// The tuning is the substance. `night` exists to be the QUIETEST, most even
// mode - for watching late without waking anyone - so its make-up gain sits
// BELOW unity. If it ever drifts above, the mode does the opposite of what its
// name promises, and nothing else in the app would notice.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_FILTER_KEY,
  audioFilterLabels,
  storedAudioFilter,
  useAudioFilter,
} from './audio-filter';

// ONE graph for the whole file, not one per test.
//
// The module keeps its AudioContext in a module-level singleton and its per-
// element graphs in a module-level WeakMap, so a fresh stub per test would be
// ignored after the first one that builds a graph - every later assertion would
// read a stub the module never touched. The counters are cleared between tests
// instead, and each test uses a NEW <video>, which is what the WeakMap keys on.
const param = () => ({ value: 0 });
const comp = {
  threshold: param(),
  knee: param(),
  ratio: param(),
  attack: param(),
  release: param(),
  connect: vi.fn(),
};
const gain = { gain: param(), connect: vi.fn() };
const source = { connect: vi.fn(), disconnect: vi.fn() };
const ctx = {
  state: 'running',
  destination: {},
  resume: vi.fn(),
  createMediaElementSource: vi.fn(() => source),
  createDynamicsCompressor: vi.fn(() => comp),
  createGain: vi.fn(() => gain),
};

/** Install the graph. A plain function, because the module calls `new
 * AudioContext()` and every one of those calls has to hand back the ONE shared
 * stub above: `new` on a function that returns an object yields that object.
 * An arrow cannot be `new`ed at all, and a class returning from its constructor
 * does the same thing while reading as a mistake. */
function stubAudio() {
  vi.stubGlobal('AudioContext', function AudioContextStub() {
    return ctx;
  });
  return { ctx, comp, gain, source };
}

function memoryStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  });
  return map;
}

const videoRef = () => ({ current: document.createElement('video') });

beforeEach(() => {
  memoryStorage();
  for (const fn of [
    ctx.createMediaElementSource,
    ctx.createDynamicsCompressor,
    ctx.createGain,
    source.connect,
    source.disconnect,
    comp.connect,
    gain.connect,
  ]) {
    fn.mockClear();
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AUDIO_FILTER_KEY', () => {
  it('names every mode exactly once', () => {
    expect(Object.keys(AUDIO_FILTER_KEY).sort()).toEqual(['night', 'off', 'standard']);
    expect(new Set(Object.values(AUDIO_FILTER_KEY)).size).toBe(3);
  });

  it('resolves the three names through the catalog', () => {
    const t = ((k: string) => `<${k}>`) as never;
    expect(audioFilterLabels(t)).toEqual({
      off: '<player.audioFilterOff>',
      standard: '<player.audioFilterStandard>',
      night: '<player.audioFilterNight>',
    });
  });
});

describe('storedAudioFilter', () => {
  it('is off with nothing stored', () => {
    expect(storedAudioFilter()).toBe('off');
  });

  it('reads back a remembered mode', () => {
    memoryStorage().set('kroma.audioFilter', 'night');
    expect(storedAudioFilter()).toBe('night');
  });

  // A value from an older build (or a hand-edited store) must not select a mode
  // the graph cannot configure.
  it('ignores a value that is not a mode', () => {
    memoryStorage().set('kroma.audioFilter', 'banana');
    expect(storedAudioFilter()).toBe('off');
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
    });
    expect(storedAudioFilter()).toBe('off');
  });
});

describe('useAudioFilter', () => {
  it('reports support when the browser has Web Audio', () => {
    stubAudio();
    const ref = videoRef();
    const { result } = renderHook(() => useAudioFilter(ref, 'k1'));
    expect(result.current.supported).toBe(true);
  });

  // A television levels audio in its own DSP, so the row hides rather than
  // offering a mode that would do nothing.
  it('reports no support where there is no AudioContext', () => {
    vi.stubGlobal('AudioContext', undefined);
    const ref = videoRef();
    const { result } = renderHook(() => useAudioFilter(ref, 'k1'));
    expect(result.current.supported).toBe(false);
  });

  it('starts from the remembered mode', () => {
    stubAudio();
    memoryStorage().set('kroma.audioFilter', 'standard');
    const ref = videoRef();
    const { result } = renderHook(() => useAudioFilter(ref, 'k1'));
    expect(result.current.mode).toBe('standard');
  });

  it('remembers a mode the viewer picks', () => {
    stubAudio();
    const store = memoryStorage();
    const ref = videoRef();
    const { result } = renderHook(() => useAudioFilter(ref, 'k1'));
    act(() => result.current.setMode('night'));
    expect(result.current.mode).toBe('night');
    expect(store.get('kroma.audioFilter')).toBe('night');
  });

  it('still switches when the store refuses the write', () => {
    stubAudio();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('denied');
      },
    });
    const ref = videoRef();
    const { result } = renderHook(() => useAudioFilter(ref, 'k1'));
    act(() => result.current.setMode('night'));
    expect(result.current.mode).toBe('night');
  });

  it('builds no graph at all while the mode is off', () => {
    const { ctx } = stubAudio();
    const ref = videoRef();
    renderHook(() => useAudioFilter(ref, 'k1'));
    expect(ctx.createMediaElementSource).not.toHaveBeenCalled();
  });

  it('wires the element through the compressor once enabled', () => {
    const { ctx, source, comp } = stubAudio();
    const ref = videoRef();
    const { result } = renderHook(() => useAudioFilter(ref, 'k1'));
    act(() => result.current.setMode('standard'));
    expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledWith(comp);
  });

  // `createMediaElementSource` is once-per-element for its LIFETIME - a second
  // call throws - so the graph is keyed by element, not by mode change.
  it('reuses one graph per element across mode changes', () => {
    const { ctx } = stubAudio();
    const ref = videoRef();
    const { result } = renderHook(() => useAudioFilter(ref, 'k1'));
    act(() => result.current.setMode('standard'));
    act(() => result.current.setMode('night'));
    act(() => result.current.setMode('off'));
    expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
  });

  it('routes straight to the output when switched back off', () => {
    const { ctx, source } = stubAudio();
    const ref = videoRef();
    const { result } = renderHook(() => useAudioFilter(ref, 'k1'));
    act(() => result.current.setMode('standard'));
    act(() => result.current.setMode('off'));
    expect(source.connect).toHaveBeenLastCalledWith(ctx.destination);
  });

  describe('tuning', () => {
    it('standard lifts the quiet parts', () => {
      const { gain, comp } = stubAudio();
      const ref = videoRef();
      const { result } = renderHook(() => useAudioFilter(ref, 'k1'));
      act(() => result.current.setMode('standard'));
      expect(comp.ratio.value).toBe(4);
      expect(gain.gain.value).toBeGreaterThan(1);
    });

    // The whole point of the mode: never louder than off or standard.
    it('night clamps harder AND sits below unity gain', () => {
      const { gain, comp } = stubAudio();
      const ref = videoRef();
      const { result } = renderHook(() => useAudioFilter(ref, 'k1'));
      act(() => result.current.setMode('night'));
      expect(comp.ratio.value).toBe(8);
      expect(gain.gain.value).toBeLessThan(1);
    });
  });

  it('re-wires when the element is remounted', () => {
    const { ctx } = stubAudio();
    const first = videoRef();
    const { result, rerender } = renderHook(({ ref, key }) => useAudioFilter(ref, key), {
      initialProps: { ref: first, key: 'k1' },
    });
    act(() => result.current.setMode('standard'));
    expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
    // A fresh <video> (anchor change / audio switch) needs its own graph.
    rerender({ ref: videoRef(), key: 'k2' });
    expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(2);
  });
});
