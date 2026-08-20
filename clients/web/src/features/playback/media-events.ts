// The `<video>` element event wiring; `useVideoPlayback` owns the React
// state/effects that drive these helpers.

import type { MovieView } from '#web/shared/lib/api';

export interface MediaEventSetters {
  setCur: (n: number) => void;
  setDur: (n: number) => void;
  setBufEnd: (n: number) => void;
  setPlaying: (b: boolean) => void;
  setWaiting: (b: boolean) => void;
  setVolume: (n: number) => void;
  setMuted: (b: boolean) => void;
  setRate: (n: number) => void;
  setReady: (b: boolean) => void;
}

/** Subscribes the media element's events to the state setters and drives a
 * resilient, ready-gated autoplay. Returns the unsubscribe cleanup. */
export function bindMediaEvents(
  v: HTMLVideoElement,
  item: MovieView,
  setters: MediaEventSetters,
  baseSec = 0,
  // Preferred over the element's `duration`, which for a growing HLS EVENT
  // playlist is only the produced edge, not the whole movie. 0 = unknown.
  knownDurationMs = 0,
): () => void {
  const {
    setCur,
    setDur,
    setBufEnd,
    setPlaying,
    setWaiting,
    setVolume,
    setMuted,
    setRate,
    setReady,
  } = setters;
  const durMs = knownDurationMs || item.durationMs || 0;
  const onTime = () => setCur(baseSec + v.currentTime);
  const onDur = () => {
    const total = durMs ? durMs / 1000 : 0;
    if (total > 0) setDur(total);
    else if (Number.isFinite(v.duration)) setDur(baseSec + v.duration);
  };
  const onProg = () =>
    setBufEnd(v.buffered.length ? baseSec + v.buffered.end(v.buffered.length - 1) : 0);
  const onPause = () => setPlaying(false);
  const onWaiting = () => setWaiting(true);
  const onPlaying = () => setWaiting(false);
  const onVol = () => {
    setVolume(v.volume);
    setMuted(v.muted);
  };
  const onRate = () => setRate(v.playbackRate);

  // Stop retrying once playback actually starts, so we never fight a real user pause.
  let started = false;
  const onReady = () => {
    setReady(true);
    if (started || !v.paused) return;
    const p = v.play();
    p?.catch(() => undefined);
  };
  const onStarted = () => {
    started = true;
    setPlaying(true);
  };

  v.addEventListener('timeupdate', onTime);
  v.addEventListener('durationchange', onDur);
  v.addEventListener('progress', onProg);
  v.addEventListener('play', onStarted);
  v.addEventListener('pause', onPause);
  v.addEventListener('waiting', onWaiting);
  v.addEventListener('playing', onPlaying);
  v.addEventListener('volumechange', onVol);
  v.addEventListener('ratechange', onRate);
  v.addEventListener('loadedmetadata', onReady);
  v.addEventListener('loadeddata', onReady);
  v.addEventListener('canplay', onReady);
  return () => {
    v.removeEventListener('timeupdate', onTime);
    v.removeEventListener('durationchange', onDur);
    v.removeEventListener('progress', onProg);
    v.removeEventListener('play', onStarted);
    v.removeEventListener('pause', onPause);
    v.removeEventListener('waiting', onWaiting);
    v.removeEventListener('playing', onPlaying);
    v.removeEventListener('volumechange', onVol);
    v.removeEventListener('ratechange', onRate);
    v.removeEventListener('loadedmetadata', onReady);
    v.removeEventListener('loadeddata', onReady);
    v.removeEventListener('canplay', onReady);
  };
}
