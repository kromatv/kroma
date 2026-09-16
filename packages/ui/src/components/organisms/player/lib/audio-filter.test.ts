// @vitest-environment jsdom
//
// The volume normalizer (§7): a Web Audio compressor behind the player's
// <video>. The tuning is the substance: `night` must sit BELOW unity gain,
// or the quietest mode ends up louder than the others.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_FILTER_KEY,
  audioFilterLabels,
  storedAudioFilter,
  useAudioFilter,
} from './audio-filter';

// One graph for the whole file, not one per test: the module's AudioContext is
// a module-level singleton, so a fresh stub per test would be ignored after the
// first one that builds a graph. Each test uses a NEW <video> instead, which is
// what the per-element WeakMap keys on.
const param = () => ({ value: 0 });
const comp = {
  threshold: param(),
  knee: param(),
  ratio: param(),
  attack: param(),
  release: param(),
  connect: vi.fn(),
};
const limiter = {
  threshold: param(),
  knee: param(),
  ratio: param(),
  attack: param(),
  release: param(),
  connect: vi.fn(),
};
const gain = { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
const boost = { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
const source = { connect: vi.fn(), disconnect: vi.fn() };
// A graph asks for its filter pair first and its boost pair second, so the
// stubs are handed out in that order and each test builds one graph.
let comps = 0;
let gains = 0;
const ctx = {
  state: 'running',
  destination: {},
  resume: vi.fn(),
  createMediaElementSource: vi.fn(() => source),
  createDynamicsCompressor: vi.fn(() => (comps++ % 2 === 0 ? comp : limiter)),
  createGain: vi.fn(() => (gains++ % 2 === 0 ? gain : boost)),
};

// A plain function, not arrow or class: the module calls `new AudioContext()`,
// and only a function returning an object honors `new` by handing back that object.
function stubAudio() {
  vi.stubGlobal('AudioContext', function AudioContextStub() {
    return ctx;
  });
  return { ctx, comp, gain, boost, limiter, source };
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
  comps = 0;
  gains = 0;
  for (const fn of [
    ctx.createMediaElementSource,
    ctx.createDynamicsCompressor,
    ctx.createGain,
    source.connect,
    source.disconnect,
    comp.connect,
    gain.connect,
    boost.connect,
    boost.disconnect,
  ]) {
    fn.mockClear();
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AUDIO_FILTER_KEY', () => {
  it('names every mode exactly once', () => {
    expect(Object.keys(AUDIO_FILTER_KEY).sort()).toEqual(['boost', 'night', 'off', 'standard']);
    expect(new Set(Object.values(AUDIO_FILTER_KEY)).size).toBe(4);
  });

  it('resolves every name through the catalog', () => {
    const t = ((k: string) => `<${k}>`) as never;
    expect(audioFilterLabels(t)).toEqual({
      off: '<player.audioFilterOff>',
      standard: '<player.audioFilterStandard>',
      night: '<player.audioFilterNight>',
      boost: '<player.audioFilterBoost>',
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

  it('routes past the compressor when switched back off', () => {
    const { ctx, source, boost } = stubAudio();
    const ref = videoRef();
    const { result } = renderHook(() => useAudioFilter(ref, 'k1'));
    act(() => result.current.setMode('standard'));
    act(() => result.current.setMode('off'));
    expect(source.connect).toHaveBeenLastCalledWith(boost);
    expect(boost.connect).toHaveBeenLastCalledWith(ctx.destination);
  });

  describe('boost', () => {
    it('builds the graph for a level past 100% with the mode off, and limits it', () => {
      const { ctx, source, boost, limiter } = stubAudio();
      const ref = videoRef();
      renderHook(() => useAudioFilter(ref, 'k1', 1.5));
      expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
      expect(source.connect).toHaveBeenLastCalledWith(boost);
      expect(boost.gain.value).toBe(1.5);
      expect(boost.connect).toHaveBeenLastCalledWith(limiter);
      expect(limiter.ratio.value).toBeGreaterThan(10);
    });

    it('drops the limiter and sits at unity once the level is back under 100%', () => {
      const { ctx, boost } = stubAudio();
      const ref = videoRef();
      const { rerender } = renderHook(({ level }) => useAudioFilter(ref, 'k1', level), {
        initialProps: { level: 2 },
      });
      rerender({ level: 1 });
      expect(boost.gain.value).toBe(1);
      expect(boost.connect).toHaveBeenLastCalledWith(ctx.destination);
    });

    it('leaves the make-up gain of the mode alone', () => {
      const { gain, boost } = stubAudio();
      const ref = videoRef();
      const { result } = renderHook(() => useAudioFilter(ref, 'k1', 1.5));
      act(() => result.current.setMode('standard'));
      expect(gain.gain.value).toBe(1.4);
      expect(boost.gain.value).toBe(1.5);
    });
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
