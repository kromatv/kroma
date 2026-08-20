import type { EngineDecision } from '@kroma/core';
import { useCallback, useRef, useState } from 'react';
import type { VideoPlayback } from '#web/features/playback/video-engine';

export interface VideoTransportOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  barRef: React.RefObject<HTMLDivElement | null>;
  decisionKind: EngineDecision['kind'];
  baseSec: number;
  knownDurationMs: number;
  dur: number;
  setAnchor: (sec: number) => void;
}

export type VideoTransport = Pick<
  VideoPlayback,
  | 'scrubbing'
  | 'setScrubbing'
  | 'scrubPreview'
  | 'scrubToClientX'
  | 'commitScrub'
  | 'hover'
  | 'setHover'
  | 'togglePlay'
  | 'skip'
  | 'seekTo'
  | 'getPosition'
  | 'setVol'
  | 'toggleMute'
  | 'applyRate'
  | 'toggleFullscreen'
  | 'seekToClientX'
  | 'onBarMove'
>;

/** Every action the player chrome can take on the element, plus the scrub-bar
 * state that only those actions read. Positions crossing this boundary are
 * absolute; the anchored HLS clock is converted against `baseSec`. */
export function useVideoTransport(opts: VideoTransportOptions): VideoTransport {
  const { videoRef, containerRef, barRef, decisionKind, baseSec, knownDurationMs, dur, setAnchor } =
    opts;

  const [hover, setHover] = useState<{ x: number; t: number; w: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubPreview, setScrubPreview] = useState<number | null>(null);
  const scrubPreviewRef = useRef<number | null>(null);
  scrubPreviewRef.current = scrubPreview;

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      const p = v.play();
      if (typeof p?.then === 'function') p.catch(() => undefined);
    } else v.pause();
  }, [videoRef]);

  // A target inside the anchored stream's produced range is a native seek;
  // otherwise it re-anchors, remounting the <video> with a fresh remux.
  const seekTo = useCallback(
    (absSec: number) => {
      const v = videoRef.current;
      if (!v) return;
      const total = knownDurationMs ? knownDurationMs / 1000 : 0;
      const target = Math.max(0, total ? Math.min(total - 1, absSec) : absSec);

      if (decisionKind === 'direct') {
        v.currentTime = target;
        return;
      }
      const rel = target - baseSec;
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
    [decisionKind, baseSec, knownDurationMs, videoRef, setAnchor],
  );

  const getPosition = useCallback(
    () => baseSec + (videoRef.current?.currentTime ?? 0),
    [baseSec, videoRef],
  );

  const skip = useCallback(
    (delta: number) => {
      if (!videoRef.current) return;
      seekTo(getPosition() + delta);
    },
    [seekTo, getPosition, videoRef],
  );

  const clientXToSec = useCallback(
    (clientX: number): number | null => {
      const v = videoRef.current;
      const bar = barRef.current;
      if (!v || !bar) return null;
      let total: number;
      if (knownDurationMs) total = knownDurationMs / 1000;
      else if (Number.isFinite(v.duration)) total = v.duration;
      else total = 0;
      if (!total) return null;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return pct * total;
    },
    [knownDurationMs, videoRef, barRef],
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
    [dur, scrubbing, barRef],
  );

  const setVol = useCallback(
    (val: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.volume = Math.max(0, Math.min(1, val));
      v.muted = v.volume === 0;
    },
    [videoRef],
  );

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, [videoRef]);

  const applyRate = useCallback(
    (r: number) => {
      const v = videoRef.current;
      if (v) v.playbackRate = r;
    },
    [videoRef],
  );

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
  }, [videoRef, containerRef]);

  return {
    hover,
    setHover,
    scrubbing,
    setScrubbing,
    scrubPreview,
    scrubToClientX,
    commitScrub,
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
