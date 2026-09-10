import type { PlaybackMode } from '@kromatv/client/playback';
import { audioTracksOf, type EngineDecision, preferredAudioIndex } from '@kromatv/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { setWebEnginePref, type WebEnginePref } from '#web/features/playback/engine-pref';
import { bindMediaEvents } from '#web/features/playback/media-events';
import { useEngineDecision } from '#web/features/playback/use-engine-decision';
import { useResumeAnchor } from '#web/features/playback/use-resume-anchor';
import { useStallRecovery } from '#web/features/playback/use-stall-recovery';
import { useStreamProbe } from '#web/features/playback/use-stream-probe';
import { useVideoTransport } from '#web/features/playback/use-video-transport';
import { useWaitReason } from '#web/features/playback/use-wait-reason';
import { attachMediaSource, type VideoPlayback } from '#web/features/playback/video-engine';
import type { MovieView } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';

export type { VideoPlayback } from '#web/features/playback/video-engine';

const MAX_GIVE_UPS = 2;

function modeOf(decision: EngineDecision): PlaybackMode {
  if (decision.kind === 'direct') return 'direct';
  return decision.aacMaster ? 'transcode' : 'remux';
}

/** Owns the `<video>` element: playback state, source decision (direct-play vs
 * HLS remux), fullscreen, and every transport action. The underlying HLS clock
 * is anchor-relative; positions reported by the hook are always absolute. */
export function useVideoPlayback(item: MovieView): VideoPlayback {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(true);
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
  const wantPlay = useRef(true);
  const giveUps = useRef(0);

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

  const restartAt = useCallback((absSec: number) => setAnchor(Math.max(0, absSec)), [setAnchor]);
  const { baseSec, srcReady, serverDurSec, failure, refused, fail } = useStreamProbe({
    itemId: item.id,
    decision,
    anchor,
    audioIndex,
    booted: bootAnchor !== null,
    restartAt,
  });

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
        setPlaying: (on: boolean) => {
          wantPlay.current = on;
          setPlaying(on);
        },
        onPlaying: () => {
          giveUps.current = 0;
        },
        setVolume,
        setMuted,
        setRate,
        setReady,
      },
      baseSec,
      knownDurationMs,
      wantPlay.current,
    );
  }, [item, anchor, audioIndex, baseSec, knownDurationMs]);

  const absNow = useCallback(() => baseSec + (videoRef.current?.currentTime ?? 0), [baseSec]);
  const onRefused = useCallback((status: number) => refused(status, absNow()), [refused, absNow]);
  const giveUp = useCallback(() => {
    giveUps.current += 1;
    if (giveUps.current > MAX_GIVE_UPS) fail('broken');
    else restartAt(absNow());
  }, [absNow, restartAt, fail]);

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
      onGiveUp: giveUp,
      onRefused,
    });
  }, [
    item,
    decision,
    env.safari,
    enginePref,
    anchor,
    audioIndex,
    bootAnchor,
    srcReady,
    giveUp,
    onRefused,
  ]);

  const stalled = useStallRecovery({
    videoRef,
    hlsRef,
    shakaRef,
    baseSec,
    active: ready && srcReady && playing,
    onRestart: restartAt,
  });

  const reason = useWaitReason({
    videoRef,
    intent: playing,
    attaching: bootAnchor === null || !srcReady,
    stuck: stalled,
    remount: `${anchor}:${audioIndex}`,
  });

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
      if (decision.kind !== 'direct') setAnchor(Math.max(0, Math.floor(absNow())));
    },
    [decision.kind, absNow, setAnchor],
  );

  const setEnginePref = useCallback(
    (p: WebEnginePref) => {
      setWebEnginePref(p);
      setForceHls(false);
      setEnginePrefState(p);
      setAnchor(Math.max(0, Math.floor(absNow())));
    },
    [absNow, setAnchor, setForceHls, setEnginePrefState],
  );

  const healthy = failure === null;
  return {
    videoRef,
    containerRef,
    barRef,
    enginePref,
    setEnginePref,
    playing: playing && healthy,
    waiting: healthy && reason !== null,
    waitReason: healthy ? reason : null,
    failure,
    mode: modeOf(decision),
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
