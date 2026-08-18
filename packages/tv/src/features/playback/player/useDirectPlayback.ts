import {
  type AudioTrack,
  audioTrackLabel,
  audioTracksOf,
  canDirectPlay,
  type DirectPlayVerdict,
  type KromaClient,
  type MediaItem,
  type MessageKey,
  type PlayEnv,
  preferredAudioIndex,
} from '@kroma/core';
import {
  type AudioFilterMode,
  type PlaneRect,
  storedAudioFilter,
  usePlaybackHeartbeat,
  useT,
} from '@kroma/ui';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  type EnginePref,
  getEnginePref,
  setEnginePref as persistEnginePref,
} from '#tv/app/enginePref';
import { createTvEngine, planEngine } from '#tv/features/playback/player/backend';
import {
  type EngineListeners,
  getTauri,
  mpvAvailable,
  renditionFor,
  type Surface,
  type TvEngine,
} from '#tv/features/playback/player/engine';
import { useResumeAndPersist } from '#tv/features/playback/player/useResumeAndPersist';
import { useSeekGesture } from '#tv/features/playback/player/useSeekGesture';
import { vlcAvailable } from '#tv/features/playback/player/vlcPlane';

export type { Surface };

export interface Playback {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  engineRef: React.RefObject<TvEngine | null>;
  objectRef: React.RefObject<HTMLObjectElement | null>;
  surface: Surface;
  enginePref: EnginePref;
  setEngine: (p: EnginePref) => void;
  setPlaneRect: (rect: PlaneRect | null) => void;
  setAudioFilter: (mode: AudioFilterMode) => void;
  audioFilterSupported: boolean;
  verdict: DirectPlayVerdict | null;
  error: MessageKey | null;
  terminated: string | null;
  ready: boolean;
  playing: boolean;
  waiting: boolean;
  cur: number;
  dur: number;
  bufEnd: number;
  audioTracks: AudioTrack[];
  audioIndex: number;
  setAudio: (index: number) => void;
  togglePlay: () => void;
  seek: (delta: number) => void;
  seekTo: (absSec: number) => void;
  getPosition: () => number;
  seekScrub: (absSec: number) => void;
  seekScrubCommit: () => void;
  seekPreview: number | null;
  endedNonce: number;
  seekNonce: number;
  surfaceNonce: number;
}

function detectTvEnv(): PlayEnv {
  if (mpvAvailable()) return { platform: 'desktop', safari: false };
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  // Tauri on macOS is WKWebView (Safari engine: native HEVC + AC3/EAC3), so treating
  // it as Safari web matches the in-page <video> and spawns no second mpv window.
  if (getTauri() != null && /Mac|Macintosh/i.test(ua)) return { platform: 'web', safari: true };
  const webos = /web0?s/i.test(ua) || (globalThis as Record<string, unknown>).webOS !== undefined;
  const chromeMajor = Number(/Chrome\/(\d+)/i.exec(ua)?.[1]);
  return {
    platform: webos ? 'webos' : 'tizen',
    safari: false,
    // Legacy webOS engines (Chromium < 99, pre-2024 models) cannot decode HEVC
    // through MSE/hls.js; their native media pipeline plays the HLS master directly.
    nativeHls: webos && Number.isFinite(chromeMajor) && chromeMajor < 99,
  };
}

function openingAudioIndex(item: MediaItem, audioLanguage?: string | null): number {
  const tracks = audioTracksOf(item);
  const preferred = preferredAudioIndex(tracks, audioLanguage);
  if (preferred != null) return preferred;
  return (tracks.find((tr) => tr.default) ?? tracks[0])?.index ?? 0;
}

/**
 * Play a media item on the TV: a compatible MP4 direct-plays in `<video>`, everything
 * else uses the complete-VOD HLS master. Resume and progress are persisted.
 */
export function useDirectPlayback(
  client: KromaClient,
  item: MediaItem,
  audioLanguage?: string | null,
): Playback {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectRef = useRef<HTMLObjectElement>(null);
  const engineRef = useRef<TvEngine | null>(null);
  const startedRef = useRef(false);

  const [error, setError] = useState<MessageKey | null>(null);
  const [terminated, setTerminated] = useState<string | null>(null);
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
  const [endedNonce, setEndedNonce] = useState(0);
  const [seekNonce, setSeekNonce] = useState(0);
  // `engineRef` is a ref, so the surface cannot see a replaced player without this.
  const [surfaceNonce, setSurfaceNonce] = useState(0);
  // Picked in the INITIALISER: the engine muxes the rendition into its source, so a
  // late switch would re-anchor the stream.
  const [audioIndex, setAudioIndex] = useState(() => openingAudioIndex(item, audioLanguage));
  const audioIndexRef = useRef(audioIndex);
  audioIndexRef.current = audioIndex;

  const audioTracks = audioTracksOf(item);

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
  const [enginePref, setEnginePrefState] = useState<EnginePref>(getEnginePref);
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

  // Resolved BEFORE the engine is built so it opens there; loading at 0 and re-seeking
  // reloads the whole stream. Keyed by id: an item swap leaves this stale for a render.
  const [resolved, setResolved] = useState<{ id: string; sec: number } | null>(null);
  useEffect(() => {
    if (!client.hasAuth) {
      setResolved({ id: item.id, sec: 0 });
      return;
    }
    let done = false;
    const settle = (sec: number) => {
      if (done) return;
      done = true;
      setResolved({ id: item.id, sec });
    };
    // Never let a stalled progress fetch block playback forever.
    const timer = setTimeout(() => settle(0), 4000);
    client
      .itemProgress(item.id)
      .then((p) => {
        const durMs = p?.durationMs ?? item.durationMs ?? 0;
        const posSec = p ? p.positionMs / 1000 : 0;
        // Resume only when meaningfully into the title and not ~finished.
        settle(p && posSec > 15 && (!durMs || p.positionMs < durMs * 0.95) ? posSec : 0);
      })
      .catch(() => settle(0));
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, [client, item]);
  const startSec = resolved?.id === item.id ? resolved.sec : null;

  // Audio switches do NOT re-create the engine; they call setAudioRendition in place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: env.nativeHls is a session-constant capability; the dep list is intentionally curated to rebuild only on item/engine changes.
  useEffect(() => {
    setReady(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const getPosition = useCallback(() => engineRef.current?.position() ?? 0, []);
  const setPlaneRect = useCallback((rect: PlaneRect | null) => {
    engineRef.current?.setRect?.(rect);
  }, []);
  const setAudioFilter = useCallback((mode: AudioFilterMode) => {
    engineRef.current?.setAudioFilter?.(mode);
  }, []);
  const runtime = useCallback(() => engineRef.current?.duration() || durationSec, [durationSec]);

  useResumeAndPersist(client, item, {
    getPosition,
    getDuration: runtime,
    paused: !playing,
    endedNonce,
  });

  usePlaybackHeartbeat({
    client,
    enabled: client.hasAuth,
    eventsToken: () => client.sessionToken,
    itemId: item.id,
    durationMs: item.durationMs ?? null,
    getPosition,
    getState: () => {
      if (!playing) return 'paused';
      return waiting ? 'buffering' : 'playing';
    },
    getAudio: () =>
      audioTrackLabel(
        t,
        audioTracks.find((a) => a.index === audioIndex),
      ),
    pingSignal: `${playing}|${waiting}|${audioIndex}`,
    mode: playbackMode,
    player: 'KROMA TV',
    device: deviceLabel,
    eventsBaseUrl: client.baseUrl,
    idPrefix: 'tv',
    onTerminated: (message) => {
      engineRef.current?.pause();
      setTerminated(message.trim() || '');
    },
  });

  const togglePlay = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    if (e.isPaused()) e.play();
    else e.pause();
  }, []);

  const clamp = useCallback(
    (target: number) => {
      const total = runtime();
      return Math.max(0, total > 0 ? Math.min(total - 0.5, target) : target);
    },
    [runtime],
  );

  const seekTo = useCallback(
    (absSec: number) => {
      const target = clamp(absSec);
      // The gesture drops its preview on commit, so without this the bar snaps back to
      // the old `cur` for a whole HLS re-anchor. Safe: a replaced player's timeUpdates
      // are dropped.
      setCur(target);
      engineRef.current?.seekTo(target);
      setSeekNonce((n) => n + 1);
    },
    [clamp],
  );

  const seek = useCallback((delta: number) => seekTo(getPosition() + delta), [seekTo, getPosition]);

  const {
    preview: seekPreview,
    scrub: seekScrub,
    commit: seekScrubCommit,
  } = useSeekGesture({ duration: runtime, seekTo });

  const setAudio = useCallback(
    (index: number) => setAudioIndex((c) => (c === index ? c : index)),
    [],
  );

  // Re-anchor the resume position so the rebuilt engine resumes here, not at 0.
  const setEngine = useCallback(
    (p: EnginePref) => {
      if (p === enginePref) return;
      const pos = engineRef.current?.position() ?? 0;
      persistEnginePref(p);
      setResolved({ id: item.id, sec: pos });
      // Clears any automatic fallback: once the viewer names an engine, that is the
      // choice, and the plan must stop overriding it for the rest of the title.
      setVlcFallbackFor(null);
      setEnginePrefState(p);
    },
    [enginePref, item.id],
  );

  return {
    videoRef,
    objectRef,
    engineRef,
    surface,
    enginePref,
    setEngine,
    setPlaneRect,
    setAudioFilter,
    audioFilterSupported,
    verdict: playVerdict,
    error,
    terminated,
    ready,
    playing,
    waiting,
    cur,
    dur,
    bufEnd,
    audioTracks,
    audioIndex,
    setAudio,
    togglePlay,
    seek,
    seekTo,
    getPosition,
    seekScrub,
    seekScrubCommit,
    seekPreview,
    endedNonce,
    seekNonce,
    surfaceNonce,
  };
}
