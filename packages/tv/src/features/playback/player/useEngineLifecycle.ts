import {
  audioTracksOf,
  canDirectPlay,
  type DirectPlayVerdict,
  type KromaClient,
  type MediaItem,
  type MessageKey,
  preferredAudioIndex,
} from '@kroma/core';
import { storedAudioFilter } from '@kroma/ui';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  type EnginePref,
  getEnginePref,
  setEnginePref as persistEnginePref,
} from '#tv/app/enginePref';
import { createTvEngine, type EnginePlan, planEngine } from '#tv/features/playback/player/backend';
import { detectTvEnv } from '#tv/features/playback/player/detectTvEnv';
import {
  type EngineListeners,
  renditionFor,
  type Surface,
  type TvEngine,
} from '#tv/features/playback/player/engine';
import { useResolvedStart } from '#tv/features/playback/player/useResolvedStart';
import { vlcAvailable } from '#tv/features/playback/player/vlcPlane';

export interface EngineLifecycle {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  engineRef: React.RefObject<TvEngine | null>;
  surface: Surface;
  playbackMode: EnginePlan['playbackMode'];
  deviceLabel: string;
  durationSec: number;
  enginePref: EnginePref;
  setEngine: (p: EnginePref) => void;
  audioFilterSupported: boolean;
  verdict: DirectPlayVerdict | null;
  error: MessageKey | null;
  ready: boolean;
  playing: boolean;
  waiting: boolean;
  cur: number;
  setCur: React.Dispatch<React.SetStateAction<number>>;
  dur: number;
  bufEnd: number;
  decodedAspect: number | undefined;
  audioIndex: number;
  setAudioIndex: React.Dispatch<React.SetStateAction<number>>;
  endedNonce: number;
  surfaceNonce: number;
}

function openingAudioIndex(item: MediaItem, audioLanguage?: string | null): number {
  const tracks = audioTracksOf(item);
  const preferred = preferredAudioIndex(tracks, audioLanguage);
  if (preferred != null) return preferred;
  return (tracks.find((tr) => tr.default) ?? tracks[0])?.index ?? 0;
}

export function useEngineLifecycle(
  client: KromaClient,
  item: MediaItem,
  audioLanguage?: string | null,
): EngineLifecycle {
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<TvEngine | null>(null);
  const startedRef = useRef(false);

  const [error, setError] = useState<MessageKey | null>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [ready, setReady] = useState(false);
  // Lets the load watchdog tell "slow but alive" from "dead".
  const [loadBeat, setLoadBeat] = useState(0);
  // Optimistic: an engine can only learn it has no DSP on the first real attempt.
  const [audioFilterSupported, setAudioFilterSupported] = useState(true);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(item.durationMs ? item.durationMs / 1000 : 0);
  const [bufEnd, setBufEnd] = useState(0);
  // Corrected by any engine that can read its own decoder; the catalog's
  // dimensions are anamorphic-uncorrected, so the engine wins once it answers.
  const [decodedAspect, setDecodedAspect] = useState<number | undefined>(undefined);
  const [endedNonce, setEndedNonce] = useState(0);
  // `engineRef` is a ref, so the surface cannot see a replaced player without this.
  const [surfaceNonce, setSurfaceNonce] = useState(0);
  // Picked in the INITIALISER: the engine muxes the rendition into its source, so a
  // late switch would re-anchor the stream.
  const [audioIndex, setAudioIndex] = useState(() => openingAudioIndex(item, audioLanguage));
  const audioIndexRef = useRef(audioIndex);
  audioIndexRef.current = audioIndex;

  // Keyed by id so a manual switch during playback is never undone.
  const prefItemRef = useRef(item.id);
  useEffect(() => {
    if (prefItemRef.current === item.id) return;
    prefItemRef.current = item.id;
    setAudioIndex(openingAudioIndex(item, audioLanguage));
  }, [item, audioLanguage]);

  // Tizen routes everything through native AVPlay (surround passthrough); webOS MSE
  // cannot decode AC3/EAC3, so it runs hls.js on the AAC master.
  const env = useMemo(detectTvEnv, []);
  const [enginePref, setEnginePref] = useState<EnginePref>(getEnginePref);
  // The last resort under `auto`: a title the platform player cannot decode goes to
  // the engine that carries its own decoders. Held as the item it applies to, so a
  // new title resets it by construction and one bad file cannot pin the session.
  const [vlcFallbackFor, setVlcFallbackFor] = useState<string | null>(null);
  const fellBackToVlc = vlcFallbackFor === item.id;
  // Both ways a title can die end here: the engine reporting an error, and the load
  // watchdog giving up on one that never errors and never becomes ready - which is
  // precisely the silently-undecodable case this engine exists for. Only from
  // `auto`, and only once: an explicit choice is the viewer's, and a VLC failure
  // has nowhere left to fall.
  const giveUp = useEffectEvent(() => {
    if (enginePref === 'auto' && !fellBackToVlc && vlcAvailable()) {
      setVlcFallbackFor(item.id);
      return;
    }
    setError(failKey);
  });
  const plan = planEngine(item, env, fellBackToVlc ? 'vlc' : enginePref);
  const { surface, playbackMode, deviceLabel, rebuildKey } = plan;
  const durationSec = item.durationMs ? item.durationMs / 1000 : 0;
  // Remux-only server: an undecodable video codec here truly cannot play.
  const playVerdict = useMemo(() => canDirectPlay(item), [item]);
  const failKey: MessageKey =
    surface === 'video' && !playVerdict.canDirectPlay ? playVerdict.messageKey : 'player.cantPlay';

  const { startSec, setStartSec } = useResolvedStart(client, item);

  // Audio switches do NOT re-create the engine; they call setAudioRendition in place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: env.nativeHls is a session-constant capability; the dep list is intentionally curated to rebuild only on item/engine changes.
  useEffect(() => {
    setReady(false);
    setDecodedAspect(undefined);
    startedRef.current = false;
    if (startSec == null) return;
    // The stream opens there, so the cursor must not sit at 0:00 then teleport.
    setCur(startSec);

    const listeners: EngineListeners = {
      onTime: (s) => {
        // The engine can briefly report 0 during the initial open.
        if (!startedRef.current && startSec != null && s < startSec - 2) return;
        setCur(s);
      },
      onDuration: (s) => {
        if (s > 0) setDur(s);
      },
      onBuffered: setBufEnd,
      onPlay: () => {
        startedRef.current = true;
        setPlaying(true);
        setWaiting(false);
      },
      onPause: () => setPlaying(false),
      onWaiting: () => {
        setWaiting(true);
        setLoadBeat((n) => n + 1);
      },
      onPlaying: () => setWaiting(false),
      onEnded: () => setEndedNonce((n) => n + 1),
      onError: () => giveUp(),
      onAudioFilterUnavailable: () => setAudioFilterSupported(false),
      onAspect: (a) => setDecodedAspect(a > 0 && Number.isFinite(a) ? a : undefined),
      onSurfaceChange: () => setSurfaceNonce((n) => n + 1),
      onReady: () => {
        setReady(true);
        // Ready means it works: clear a premature watchdog error, whose "codec not
        // supported" toast would otherwise linger over a playing video.
        setError(null);
        if (!startedRef.current) engineRef.current?.play();
      },
    };

    const engine = createTvEngine({
      plan,
      client,
      item,
      durationSec,
      rendition: renditionFor(item, audioIndexRef.current),
      startSec,
      // Read at build time because AVPlay picks its source from it.
      audioFilter: storedAudioFilter(),
      dom: { video: videoRef.current, nativeHls: env.nativeHls },
      listeners,
    });
    if (!engine) return; // <video> surface not mounted yet; rebuild next render
    engineRef.current = engine;
    setAudioFilterSupported(engine.audioFilterSupported?.() ?? true);
    return () => {
      engineRef.current = null;
      engine.destroy();
    };
    // `rebuildKey` stands in for every backend flag the plan resolved.
  }, [client, item, rebuildKey, durationSec, startSec, failKey]);

  useEffect(() => {
    engineRef.current?.setAudioRendition(renditionFor(item, audioIndex));
  }, [item, audioIndex]);

  // AVPlay is excluded: it reports its own prepare errors.
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadBeat is an intentional dep, not read in the body; each buffering beat re-arms the grace timer (see note below).
  useEffect(() => {
    if (surface === 'avplay' || ready || error) return;
    // libVLC on 10-bit HEVC at a deep resume point routinely takes 20s+ to reach
    // ready, and each buffering beat re-arms this timer, so only a silent load trips it.
    const graceMs = surface === 'mpv' ? 30000 : 15000;
    const graceS = graceMs / 1000;
    const id = setTimeout(() => {
      if (surface === 'mpv') {
        console.error(`[KROMA] ${surface} engine did not signal ready in ${graceS}s`);
      } else {
        const v = videoRef.current;
        const e = v?.error;
        console.error(
          `[KROMA] stream did not load in ${graceS}s: networkState=${v?.networkState} ` +
            `readyState=${v?.readyState} errorCode=${e?.code ?? '-'} ${e?.message ?? ''} ` +
            `src=${v?.currentSrc || v?.src || '(none)'}`,
        );
      }
      giveUp();
    }, graceMs);
    return () => clearTimeout(id);
  }, [surface, ready, error, failKey, loadBeat]);

  // Re-anchor the resume position so the rebuilt engine resumes here, not at 0.
  const setEngine = useCallback(
    (p: EnginePref) => {
      if (p === enginePref) return;
      const pos = engineRef.current?.position() ?? 0;
      persistEnginePref(p);
      setStartSec(pos);
      // Clears any automatic fallback: once the viewer names an engine, that is the
      // choice, and the plan must stop overriding it for the rest of the title.
      setVlcFallbackFor(null);
      setEnginePref(p);
    },
    [enginePref, setStartSec],
  );

  return {
    videoRef,
    engineRef,
    surface,
    playbackMode,
    deviceLabel,
    durationSec,
    enginePref,
    setEngine,
    audioFilterSupported,
    verdict: playVerdict,
    error,
    ready,
    playing,
    waiting,
    cur,
    setCur,
    dur,
    bufEnd,
    decodedAspect,
    audioIndex,
    setAudioIndex,
    endedNonce,
    surfaceNonce,
  };
}
