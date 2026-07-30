import {
  audioTracksOf,
  capabilities,
  type EngineDecision,
  MSE_CAPS,
  masterNeedsAac,
  type PlayEnv,
  preferredAudioIndex,
  SAFARI_CAPS,
  selectEngine,
} from '@kroma/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getWebEnginePref,
  setWebEnginePref,
  type WebEnginePref,
} from '#web/features/playback/engine-pref';
import {
  attachMediaSource,
  bindMediaEvents,
  type VideoPlayback,
} from '#web/features/playback/video-engine';
import { kromaClient, type MovieView } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';

export type { VideoPlayback } from '#web/features/playback/video-engine';

function detectWebEnv(): PlayEnv {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const safari =
    /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(ua) ||
    /iP(ad|hone|od)/i.test(ua);
  return { platform: 'web', safari, runtimeCaps: capabilities() };
}

/** Owns the `<video>` element: playback state, source decision (direct-play vs
 * HLS remux), fullscreen, and every transport action. The underlying HLS clock
 * is anchor-relative; positions reported by the hook are always absolute. */
export function useVideoPlayback(item: MovieView): VideoPlayback {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [ready, setReady] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(item.durationMs ? item.durationMs / 1000 : 0);
  const [bufEnd, setBufEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fs, setFs] = useState(false);
  const [useHls, setUseHls] = useState(false);
  const [audioIndex, setAudioIndex] = useState(() => {
    const tracks = audioTracksOf(item);
    return (tracks.find((t) => t.default) ?? tracks[0])?.index ?? 0;
  });
  // The HLS master starts at `?t=anchor`; a resume/far/backward seek changes it,
  // remounting the <video>. `bootAnchor === null` means resume hasn't resolved
  // yet, so the source effect waits rather than attaching at 0 and re-anchoring.
  const { client, user } = useAuth();
  const [anchor, setAnchor] = useState(0);
  const [bootAnchor, setBootAnchor] = useState<number | null>(null);
  useEffect(() => {
    setBootAnchor(null);
    if (!user) {
      setAnchor(0);
      setBootAnchor(0);
      return;
    }
    let cancelled = false;
    client
      .itemProgress(item.id)
      .then((p) => {
        if (cancelled) return;
        const durMs = p?.durationMs ?? item.durationMs ?? 0;
        const posSec = (p?.positionMs ?? 0) / 1000;
        const resume = p && posSec > 15 && (!durMs || p.positionMs < durMs * 0.95) ? posSec : 0;
        setAnchor(resume);
        setBootAnchor(resume);
      })
      .catch(() => {
        if (!cancelled) {
          setAnchor(0);
          setBootAnchor(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, user, item.id, item.durationMs]);
  const [hover, setHover] = useState<{ x: number; t: number; w: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubPreview, setScrubPreview] = useState<number | null>(null);
  const scrubPreviewRef = useRef<number | null>(null);
  scrubPreviewRef.current = scrubPreview;
  const audioIndexRef = useRef(0);
  audioIndexRef.current = audioIndex;

  const audioTracks = audioTracksOf(item);

  // Applies the account's preferred audio language once `user` hydrates. Uses
  // the raw setter, not `setAudio`, so it doesn't re-anchor like a manual switch.
  const audioPrefApplied = useRef(false);
  useEffect(() => {
    if (audioPrefApplied.current || !user) return;
    audioPrefApplied.current = true;
    const idx = preferredAudioIndex(audioTracks, user.audioLanguage);
    if (idx != null) setAudioIndex(idx);
  }, [user, audioTracks]);

  const env = useMemo(detectWebEnv, []);
  // Direct-play safety net: a bare `<video src>` error drops to the HLS master
  // at the same position instead of a black screen.
  const [forceHls, setForceHls] = useState(false);
  // Manual engine override (Settings). `remux`/`shaka` force the HLS master
  // (differing only in hls.js vs Shaka Player); `direct` forces `<video src>`;
  // `auto` defers to the runtime-cap decision.
  const [enginePref, setEnginePrefState] = useState<WebEnginePref>(getWebEnginePref);
  const decision = useMemo<EngineDecision>(() => {
    if (forceHls || enginePref === 'remux' || enginePref === 'shaka') {
      return {
        kind: 'web-mse',
        aacMaster: masterNeedsAac(item, env.safari ? SAFARI_CAPS : MSE_CAPS),
      };
    }
    if (enginePref === 'direct') return { kind: 'direct', aacMaster: false };
    return selectEngine(item, env);
  }, [item, env, forceHls, enginePref]);
  const hlsRef = useRef<import('hls.js').default | null>(null);
  const shakaRef = useRef<import('#web/features/playback/video-engine').ShakaPlayerLike | null>(
    null,
  );

  // `-noaccurate_seek` starts the HLS stream at the keyframe at-or-before the
  // anchor, so the real start can be earlier than requested; the server reports it
  // via `X-Hls-Start`. `srcReady` gates the attach until that offset is known.
  const [baseSec, setBaseSec] = useState(0);
  const [srcReady, setSrcReady] = useState(false);
  // `X-Media-Duration`: the server's true duration for an unprobed catalog row,
  // whose growing HLS playlist would otherwise cap the shown total at its live edge.
  const [serverDurSec, setServerDurSec] = useState(0);
  useEffect(() => {
    if (bootAnchor === null) return; // wait until resume has picked the anchor
    setSrcReady(false);
    if (decision.kind === 'direct') {
      setBaseSec(0);
      setSrcReady(true);
      return;
    }
    let cancelled = false;
    const url = kromaClient().hlsMasterUrl(item.id, decision.aacMaster, anchor, audioIndex);
    fetch(url)
      .then((r) => {
        const k = Number(r.headers.get('X-Hls-Start'));
        const d = Number(r.headers.get('X-Media-Duration'));
        if (!cancelled) {
          setBaseSec(Number.isFinite(k) ? k : anchor);
          if (Number.isFinite(d) && d > 0) setServerDurSec(d);
          setSrcReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBaseSec(anchor);
          setSrcReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, decision, anchor, audioIndex, bootAnchor]);

  const knownDurationMs =
    item.durationMs || (serverDurSec > 0 ? Math.round(serverDurSec * 1000) : 0);
  useEffect(() => {
    if (knownDurationMs > 0) setDur(knownDurationMs / 1000);
  }, [knownDurationMs]);

  // Re-binds on anchor/audio change: those remount the <video> (keyed by
  // anchor+audio in the parent), so this must rebind to the fresh element.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebind on remount.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    return bindMediaEvents(
      v,
      item,
      {
        setCur,
        setDur,
        setBufEnd,
        setPlaying,
        setWaiting,
        setVolume,
        setMuted,
        setRate,
        setReady,
      },
      baseSec,
      knownDurationMs,
    );
  }, [item, anchor, audioIndex, baseSec, knownDurationMs]);

  // The chosen audio is muxed into the stream URL, so a language change remounts
  // the element rather than switching renditions in place.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || bootAnchor === null || !srcReady) return;
    // Shaka is the default MSE engine; hls.js only on the explicit `remux`
    // override. Safari keeps native HLS unless the user picks Shaka.
    const safariNative = env.safari && enginePref !== 'shaka';
    return attachMediaSource({
      v,
      item,
      decision,
      useNativeHls: safariNative,
      useShaka: !safariNative && enginePref !== 'remux',
      startSec: anchor,
      audioRel: audioIndex,
      hlsRef,
      shakaRef,
      setUseHls,
      setReady,
    });
  }, [item, decision, env.safari, enginePref, anchor, audioIndex, bootAnchor, srcReady]);

  useEffect(() => {
    const onFs = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // A media error on the bare `<video src>` swaps to the HLS master anchored at
  // the position we died at.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebind on remount.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || decision.kind !== 'direct') return;
    const onErr = () => {
      setAnchor(Math.max(0, Math.floor(v.currentTime)));
      setForceHls(true);
    };
    v.addEventListener('error', onErr);
    return () => v.removeEventListener('error', onErr);
  }, [decision.kind, item.id, anchor, audioIndex]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: item.id is an intentional trigger (not referenced in the effect); reset forceHls whenever the item changes, not on every render.
  useEffect(() => setForceHls(false), [item.id]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      const p = v.play();
      if (typeof p?.then === 'function') p.catch(() => undefined);
    } else v.pause();
  }, []);

  // A target inside the anchored stream's produced range is a native seek;
  // otherwise it re-anchors, remounting the <video> with a fresh remux.
  const seekTo = useCallback(
    (absSec: number) => {
      const v = videoRef.current;
      if (!v) return;
      const total = knownDurationMs ? knownDurationMs / 1000 : 0;
      const target = Math.max(0, total ? Math.min(total - 1, absSec) : absSec);

      if (decision.kind === 'direct') {
        v.currentTime = target;
        return;
      }
      const rel = target - anchor;
      // Native only if the target is actually buffered - `seekable` over-reports
      // the full duration before it is produced, which would seek into a hole.
      let buffered = false;
      for (let i = 0; i < v.buffered.length; i += 1) {
        if (rel >= v.buffered.start(i) - 0.5 && rel <= v.buffered.end(i) + 0.5) {
          buffered = true;
          break;
        }
      }
      if (buffered) {
        v.currentTime = Math.max(0, rel);
      } else {
        setAnchor(target);
      }
    },
    [decision.kind, anchor, knownDurationMs],
  );

  const getPosition = useCallback(() => baseSec + (videoRef.current?.currentTime ?? 0), [baseSec]);

  const skip = useCallback(
    (delta: number) => {
      if (!videoRef.current) return;
      seekTo(getPosition() + delta);
    },
    [seekTo, getPosition],
  );

  const clientXToSec = useCallback(
    (clientX: number): number | null => {
      const v = videoRef.current;
      const bar = barRef.current;
      let total: number;
      if (knownDurationMs) total = knownDurationMs / 1000;
      else if (Number.isFinite(v?.duration)) total = (v as HTMLVideoElement).duration;
      else total = 0;
      if (!v || !bar || !total) return null;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return pct * total;
    },
    [knownDurationMs],
  );

  const scrubToClientX = useCallback(
    (clientX: number) => {
      const s = clientXToSec(clientX);
      if (s != null) setScrubPreview(s);
    },
    [clientXToSec],
  );
  const commitScrub = useCallback(() => {
    const s = scrubPreviewRef.current;
    setScrubPreview(null);
    if (s != null) seekTo(s);
  }, [seekTo]);
  const seekToClientX = useCallback(
    (clientX: number) => {
      const s = clientXToSec(clientX);
      if (s != null) seekTo(s);
    },
    [clientXToSec, seekTo],
  );

  const onBarMove = useCallback(
    (e: React.PointerEvent) => {
      const bar = barRef.current;
      if (!bar || !dur) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setHover({ x: pct * rect.width, t: pct * dur, w: rect.width });
      if (scrubbing) setScrubPreview(pct * dur);
    },
    [dur, scrubbing],
  );

  const setVol = useCallback((val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.max(0, Math.min(1, val));
    v.muted = v.volume === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  const applyRate = useCallback((r: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = r;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (document.fullscreenEnabled && typeof el.requestFullscreen === 'function') {
      void el.requestFullscreen();
      return;
    }
    // iPhone Safari has no element fullscreen API → the video's native one.
    const v = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (typeof v?.webkitEnterFullscreen === 'function') v.webkitEnterFullscreen();
  }, []);

  // For HLS, re-anchors at the current position rather than hls.js's in-place
  // `audioTrack` swap, which can leave the new audio out of sync with the picture.
  const setAudio = useCallback(
    (index: number) => {
      if (index === audioIndexRef.current) return;
      setAudioIndex(index);
      if (decision.kind !== 'direct') {
        const pos = baseSec + (videoRef.current?.currentTime ?? 0);
        setAnchor(Math.max(0, Math.floor(pos)));
      }
    },
    [decision.kind, baseSec],
  );

  const setEnginePref = useCallback(
    (p: WebEnginePref) => {
      setWebEnginePref(p);
      setForceHls(false);
      setEnginePrefState(p);
      setAnchor(Math.max(0, Math.floor(baseSec + (videoRef.current?.currentTime ?? 0))));
    },
    [baseSec],
  );

  return {
    videoRef,
    containerRef,
    barRef,
    enginePref,
    setEnginePref,
    playing,
    waiting,
    ready,
    cur,
    dur,
    bufEnd,
    volume,
    muted,
    rate,
    fs,
    useHls,
    audioTracks,
    audioIndex,
    setAudio,
    anchor,
    baseSec,
    aac: decision.kind === 'direct' ? false : Boolean(decision.aacMaster),
    hlsRef,
    shakaRef,
    scrubbing,
    setScrubbing,
    scrubPreview,
    scrubToClientX,
    commitScrub,
    hover,
    setHover,
    togglePlay,
    skip,
    seekTo,
    getPosition,
    setVol,
    toggleMute,
    applyRate,
    toggleFullscreen,
    seekToClientX,
    onBarMove,
  };
}
