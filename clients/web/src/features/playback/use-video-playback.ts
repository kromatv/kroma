import { audioTracksOf, preferredAudioIndex } from '@kroma/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { setWebEnginePref, type WebEnginePref } from '#web/features/playback/engine-pref';
import { bindMediaEvents } from '#web/features/playback/media-events';
import { useEngineDecision } from '#web/features/playback/use-engine-decision';
import { useResumeAnchor } from '#web/features/playback/use-resume-anchor';
import { useVideoTransport } from '#web/features/playback/use-video-transport';
import { attachMediaSource, type VideoPlayback } from '#web/features/playback/video-engine';
import { kromaClient, type MovieView } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';

export type { VideoPlayback } from '#web/features/playback/video-engine';

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
  const { client, user } = useAuth();
  const { anchor, setAnchor, bootAnchor } = useResumeAnchor(item, client, user);
  const audioIndexRef = useRef(0);
  audioIndexRef.current = audioIndex;

  const audioTracks = audioTracksOf(item);

  const audioPrefApplied = useRef(false);
  useEffect(() => {
    if (audioPrefApplied.current || !user) return;
    audioPrefApplied.current = true;
    const idx = preferredAudioIndex(audioTracks, user.audioLanguage);
    if (idx != null) setAudioIndex(idx);
  }, [user, audioTracks]);

  const { env, decision, enginePref, setEnginePrefState, setForceHls } = useEngineDecision(item);
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
        const start = r.headers.get('X-Hls-Start');
        const k = start === null ? Number.NaN : Number(start);
        const dur = r.headers.get('X-Media-Duration');
        const d = dur === null ? Number.NaN : Number(dur);
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
  }, [decision.kind, item.id, anchor, audioIndex, setAnchor, setForceHls]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: item.id is an intentional trigger (not referenced in the effect); reset forceHls whenever the item changes, not on every render.
  useEffect(() => setForceHls(false), [item.id, setForceHls]);

  const transport = useVideoTransport({
    videoRef,
    containerRef,
    barRef,
    decisionKind: decision.kind,
    baseSec,
    knownDurationMs,
    dur,
    setAnchor,
  });

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
    [decision.kind, baseSec, setAnchor],
  );

  const setEnginePref = useCallback(
    (p: WebEnginePref) => {
      setWebEnginePref(p);
      setForceHls(false);
      setEnginePrefState(p);
      setAnchor(Math.max(0, Math.floor(baseSec + (videoRef.current?.currentTime ?? 0))));
    },
    [baseSec, setAnchor, setForceHls, setEnginePrefState],
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
    ...transport,
  };
}
