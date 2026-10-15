// Wiring the `<video>` element's events onto an engine's listeners.

import { reachableBufferEnd } from '@kromatv/core';
import type { EngineListeners } from '#tv/features/playback/player/engine';

/**
 * Bind every event the chrome reads and return the unbind. `total` is the
 * title's own length where the catalogue knows it, and wins over the element's;
 * `anchor` is read on each event rather than captured, because a seek outside the
 * buffered range moves the remux's anchor while the element's clock restarts at 0.
 */
export function bindMediaEvents(
  v: HTMLVideoElement,
  L: EngineListeners,
  total: number,
  anchor: () => number,
): () => void {
  const onTime = () => L.onTime(anchor() + v.currentTime);
  const onDur = () => {
    if (total > 0) L.onDuration(total);
    else if (Number.isFinite(v.duration)) L.onDuration(v.duration);
  };
  const onProg = () => {
    const end = reachableBufferEnd(v.buffered, v.currentTime);
    L.onBuffered(end > 0 ? anchor() + end : 0);
  };
  const onPlay = () => L.onPlay();
  const onPause = () => L.onPause();
  const onWaiting = () => L.onWaiting();
  const onPlaying = () => L.onPlaying();
  const onEnded = () => L.onEnded();
  const onErr = () => L.onError();
  const onReady = () => L.onReady();
  // The DISPLAY size, so an anamorphic stream is already corrected. `resize`
  // covers a variant switch mid-playback, not just the first metadata.
  const onResize = () => {
    if (v.videoHeight > 0) L.onAspect?.(v.videoWidth / v.videoHeight);
  };

  const evs: [string, EventListener][] = [
    ['timeupdate', onTime],
    ['durationchange', onDur],
    ['progress', onProg],
    // Also on `timeupdate`: the reachable end jumps when the playhead crosses a
    // hole, and nothing is downloading at that moment for `progress` to fire.
    ['timeupdate', onProg],
    ['play', onPlay],
    ['pause', onPause],
    ['waiting', onWaiting],
    ['playing', onPlaying],
    ['ended', onEnded],
    ['error', onErr],
    ['loadedmetadata', onReady],
    ['loadeddata', onReady],
    ['canplay', onReady],
    ['loadedmetadata', onResize],
    ['resize', onResize],
  ];
  for (const [t, fn] of evs) v.addEventListener(t, fn);
  return () => {
    for (const [t, fn] of evs) v.removeEventListener(t, fn);
  };
}

const LANDING_SLACK_SEC = 1;
const LANDING_TRIES = 3;
const LANDING_EVENTS = ['loadedmetadata', 'canplay', 'seeked', 'timeupdate'];

/**
 * Put a freshly attached stream on `atSec` of its own clock, and return the
 * unbind. A master with no `#EXT-X-ENDLIST` reads as live, and a native HLS stack
 * opens a live playlist near its end rather than at the anchor the URL carries,
 * so a stream joined after the remux ran ahead plays minutes ahead of its clock.
 * It gives up after three tries, for an engine that lands elsewhere and stays.
 */
export function startStreamAt(v: HTMLVideoElement, atSec: number): () => void {
  let tries = 0;
  const stop = () => {
    for (const type of LANDING_EVENTS) v.removeEventListener(type, land);
  };
  const land = () => {
    if (Math.abs(v.currentTime - atSec) <= LANDING_SLACK_SEC || tries >= LANDING_TRIES) {
      stop();
      return;
    }
    tries += 1;
    v.currentTime = atSec;
  };
  for (const type of LANDING_EVENTS) v.addEventListener(type, land);
  return stop;
}

/**
 * Seek to `startSec` the first time the element knows its length, and return the
 * unbind. The `<video>` is reused across items, so a leaked listener would jump
 * the NEXT one to this offset.
 */
export function seekOnceOnMetadata(v: HTMLVideoElement, startSec: number): () => void {
  const seekOnce = () => {
    v.currentTime = startSec;
    v.removeEventListener('loadedmetadata', seekOnce);
  };
  v.addEventListener('loadedmetadata', seekOnce);
  return () => v.removeEventListener('loadedmetadata', seekOnce);
}
