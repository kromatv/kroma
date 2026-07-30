import { deviceStorage, type MessageKey, type Translate } from '@kroma/core';
import { type RefObject, useCallback, useEffect, useState } from 'react';
import { webDocument } from '#ui/lib/dom';
import type { AudioFilterMode } from '../types';

// Volume normalizer for the web player: a Web Audio compressor + make-up gain
// behind the <video>, mirrored by native DSP on TV from the same persisted value.

const KEY = 'kroma.audioFilter';

export const AUDIO_FILTER_KEY: Record<AudioFilterMode, MessageKey> = {
  off: 'player.audioFilterOff',
  standard: 'player.audioFilterStandard',
  night: 'player.audioFilterNight',
};

export function audioFilterLabels(t: Translate): Record<AudioFilterMode, string> {
  return {
    off: t(AUDIO_FILTER_KEY.off),
    standard: t(AUDIO_FILTER_KEY.standard),
    night: t(AUDIO_FILTER_KEY.night),
  };
}

/** Synchronous, so a native engine can apply the remembered mode at
 * construction, before React state has hydrated. `off` without storage/DOM. */
export function storedAudioFilter(): AudioFilterMode {
  try {
    const raw = deviceStorage()?.getItem(KEY) ?? null;
    if (raw === 'standard' || raw === 'night') return raw;
  } catch {
    /* ignore */
  }
  return 'off';
}

// biome-ignore lint/style/noRestrictedGlobals: audited - inside audioCtx(), which returns null when AudioContext is absent; the native engines level audio themselves.
let sharedCtx: AudioContext | null = null;
// biome-ignore lint/style/noRestrictedGlobals: audited - inside audioCtx(), which returns null when AudioContext is absent; the native engines level audio themselves.
function audioCtx(): AudioContext | null {
  // biome-ignore lint/style/noRestrictedGlobals: audited - Web Audio is the browser's own leveling path; the native engines do their own (mpv af, Exo DynamicsProcessing, server-side aac-night), and this returns null there.
  if (typeof AudioContext === 'undefined') return null;
  if (!sharedCtx) {
    // biome-ignore lint/style/noRestrictedGlobals: audited - inside audioCtx(), which returns null when AudioContext is absent; the native engines level audio themselves.
    sharedCtx = new AudioContext();
    // Hydrating a persisted filter isn't a user gesture, so the context can be
    // born suspended (a suspended context MUTES routed audio); any interaction un-sticks it.
    const resume = () => {
      if (sharedCtx?.state === 'suspended') void sharedCtx.resume();
    };
    const doc = webDocument();
    doc?.addEventListener('pointerdown', resume, true);
    doc?.addEventListener('keydown', resume, true);
  }
  if (sharedCtx.state === 'suspended') void sharedCtx.resume();
  return sharedCtx;
}

interface Graph {
  source: MediaElementAudioSourceNode;
  comp: DynamicsCompressorNode;
  gain: GainNode;
}

interface FilterDebugHandle {
  // biome-ignore lint/style/noRestrictedGlobals: a TYPE reference, erased at build; no value is read.
  ctx: AudioContext;
  graph: Graph;
  mode: AudioFilterMode;
}

// DEV only: the handle hard-references the <video> via `graph.source`; shipping
// it would pin a detached element's decoder buffers, defeating the WeakMap below.
function publishDebugHandle(handle: FilterDebugHandle): void {
  // Cast rather than `vite/client` types: @kroma/ui is also consumed outside a
  // Vite build (module SDK, admin-kit), where `import.meta.env` is undefined.
  if (!(import.meta as { env?: { DEV?: boolean } }).env?.DEV) return;
  (globalThis as { __kromaAudioFilter?: FilterDebugHandle }).__kromaAudioFilter = handle;
}

// `createMediaElementSource` throws on a second call for the same element, and
// the player remounts its <video> on re-anchor/audio switch, so graphs are
// keyed by element rather than by player instance.
const graphs = new WeakMap<HTMLMediaElement, Graph>();

function configure(g: Graph, mode: Exclude<AudioFilterMode, 'off'>): void {
  const { comp, gain } = g;
  if (mode === 'standard') {
    comp.threshold.value = -24;
    comp.knee.value = 30;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    gain.gain.value = 1.4;
  } else {
    // Below-unity make-up (0.9) guarantees night is never louder than
    // off/standard: it is the quietest mode by design.
    comp.threshold.value = -28;
    comp.knee.value = 20;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    gain.gain.value = 0.9;
  }
}

// Once a graph exists the element's audio always flows through it, so "off"
// becomes a straight source → destination wire rather than a teardown.
function wire(el: HTMLMediaElement, mode: AudioFilterMode): void {
  if (mode === 'off' && !graphs.has(el)) return;
  const ctx = audioCtx();
  if (!ctx) return;

  let g = graphs.get(el);
  if (!g) {
    const source = ctx.createMediaElementSource(el);
    const comp = ctx.createDynamicsCompressor();
    const gain = ctx.createGain();
    comp.connect(gain);
    gain.connect(ctx.destination);
    g = { source, comp, gain };
    graphs.set(el, g);
  }

  g.source.disconnect();
  if (mode === 'off') {
    g.source.connect(ctx.destination);
  } else {
    configure(g, mode);
    g.source.connect(g.comp);
  }
  publishDebugHandle({ ctx, graph: g, mode });
}

/** `remountKey` must change whenever the parent remounts the <video>, so the
 * graph re-attaches to the fresh element. */
export function useAudioFilter(
  videoRef: RefObject<HTMLVideoElement | null>,
  remountKey: string,
): { mode: AudioFilterMode; setMode: (m: AudioFilterMode) => void; supported: boolean } {
  const [modeState, setModeState] = useState<AudioFilterMode>('off');
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    // biome-ignore lint/style/noRestrictedGlobals: audited - this IS the capability probe; false on native, where the engines level audio themselves.
    setSupported(typeof AudioContext !== 'undefined');
    setModeState(storedAudioFilter());
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: remountKey tracks the element identity.
  useEffect(() => {
    const v = videoRef.current;
    if (v) wire(v, modeState);
  }, [modeState, remountKey, videoRef]);

  const setMode = useCallback((m: AudioFilterMode) => {
    setModeState(m);
    try {
      deviceStorage()?.setItem(KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  return { mode: modeState, setMode, supported };
}
