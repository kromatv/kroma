import { deviceStorage, type MessageKey, type Translate } from '@kroma/core';
import { type RefObject, useCallback, useEffect, useState } from 'react';
import { webDocument } from '#ui/lib/dom';
import type { AudioFilterMode } from '../types';

/**
 * Audio filter / volume normalizer (§7). A Web Audio compressor + make-up gain
 * behind the player's <video>, so it works on EVERY playback mode (direct play
 * included) without a server transcode:
 *   - off      source → destination (untouched)
 *   - standard levels the loud/quiet gap (gentle 4:1 compression + a little gain)
 *   - night    clamps loud peaks (8:1) and, crucially, sits BELOW unity gain so the
 *              whole thing is the QUIETEST, most even mode - for late-night
 *              listening where you never want a peak to wake anyone.
 * Persisted like the subtitle appearance.
 *
 * This graph only reaches an in-page media element. The native TV planes apply
 * the SAME modes with their own DSP (mpv `af`, ExoPlayer DynamicsProcessing,
 * AVPlay via the server's filtered remux - see packages/tv), all seeded from the
 * one persisted value below so the choice follows the user across engines.
 */

const KEY = 'kroma.audioFilter';

/** Catalog key naming each mode. One table, because the phone's chrome, its track
 * sheet, the kit's settings menu and the kit's filter panel all name these three
 * modes and had each grown their own copy - a fourth mode meant finding all four.
 * A mode with no name here fails to compile rather than rendering a raw key. */
export const AUDIO_FILTER_KEY: Record<AudioFilterMode, MessageKey> = {
  off: 'player.audioFilterOff',
  standard: 'player.audioFilterStandard',
  night: 'player.audioFilterNight',
};

/** The three mode names in the active locale. */
export function audioFilterLabels(t: Translate): Record<AudioFilterMode, string> {
  return {
    off: t(AUDIO_FILTER_KEY.off),
    standard: t(AUDIO_FILTER_KEY.standard),
    night: t(AUDIO_FILTER_KEY.night),
  };
}

/** The persisted filter mode (synchronous; `off` without storage/DOM). Native
 * engines read it at construction so a remembered mode applies from the first
 * frame, before React state has hydrated. */
export function storedAudioFilter(): AudioFilterMode {
  try {
    const raw = deviceStorage()?.getItem(KEY) ?? null;
    if (raw === 'standard' || raw === 'night') return raw;
  } catch {
    /* ignore */
  }
  return 'off';
}

// One page-wide AudioContext, created on first enable (a user gesture, so it is
// never born suspended by autoplay policy) and kept for the tab's lifetime.
// biome-ignore lint/style/noRestrictedGlobals: audited - inside audioCtx(), which returns null when AudioContext is absent; the native engines level audio themselves.
let sharedCtx: AudioContext | null = null;
// biome-ignore lint/style/noRestrictedGlobals: audited - inside audioCtx(), which returns null when AudioContext is absent; the native engines level audio themselves.
function audioCtx(): AudioContext | null {
  // biome-ignore lint/style/noRestrictedGlobals: audited - Web Audio is the browser's own leveling path; the native engines do their own (mpv af, Exo DynamicsProcessing, server-side aac-night), and this returns null there.
  if (typeof AudioContext === 'undefined') return null;
  if (!sharedCtx) {
    // biome-ignore lint/style/noRestrictedGlobals: audited - inside audioCtx(), which returns null when AudioContext is absent; the native engines level audio themselves.
    sharedCtx = new AudioContext();
    // A persisted filter hydrates WITHOUT a user gesture, so the context can be
    // born suspended and an element routed into a suspended context is MUTED.
    // Any interaction un-sticks it (a no-op once running, so keep it forever).
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

/** DevTools diagnostic handle (`__kromaAudioFilter`), refreshed on every (re)wire.
 * TVs are hard to debug, and the graph's classic failure is SILENT (suspended
 * context, CORS-tainted element): attach an AnalyserNode to `graph.gain` and
 * check `ctx.state` to tell "filter working" from "filter muting everything". */
interface FilterDebugHandle {
  // biome-ignore lint/style/noRestrictedGlobals: a TYPE reference, erased at build; no value is read.
  ctx: AudioContext;
  graph: Graph;
  mode: AudioFilterMode;
}

/** DEV only: `graph.source` is a MediaElementAudioSourceNode, so this handle
 * hard-references the <video>. Shipping it would pin a detached element (and
 * its decoder buffers) on a TV with very little RAM, defeating the WeakMap
 * below. Debugging a retail set is done from a dev build. */
function publishDebugHandle(handle: FilterDebugHandle): void {
  // Cast rather than `vite/client` types: @kroma/ui is also consumed outside a
  // Vite build (module SDK, admin-kit), where `import.meta.env` is undefined.
  if (!(import.meta as { env?: { DEV?: boolean } }).env?.DEV) return;
  (globalThis as { __kromaAudioFilter?: FilterDebugHandle }).__kromaAudioFilter = handle;
}

// `createMediaElementSource` is once-per-element for the element's LIFETIME (a
// second call throws), and the player REMOUNTS its <video> on re-anchor / audio
// switch, so graphs are keyed by element, not by player instance.
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
    // night: clamp the loud stuff (peaks pulled down to near dialogue level) and
    // keep the OUTPUT quiet + even. Below-unity make-up (0.9) guarantees night is
    // never louder than off/standard - it is the quietest mode by design. A less
    // extreme threshold than the peak-limiter tuning keeps speech intelligible
    // rather than crushing everything to a whisper.
    comp.threshold.value = -28;
    comp.knee.value = 20;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    gain.gain.value = 0.9;
  }
}

/** Route (or re-route) an element's audio for the given mode. Off with no
 * existing graph is a no-op the element keeps its native output path. Once a
 * graph exists the element's audio ALWAYS flows through it, so "off" becomes a
 * straight source → destination wire. */
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

/**
 * The normalizer hook. `remountKey` must change whenever the parent remounts the
 * <video> (anchor / audio track) so the graph re-attaches to the fresh element.
 */
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

  // Re-wire on mode change AND on <video> remount (fresh element, fresh graph).
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
