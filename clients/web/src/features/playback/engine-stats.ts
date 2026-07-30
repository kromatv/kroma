// Live transport metrics from whichever MSE engine is playing the HLS master
// (Shaka Player or hls.js), plus a measured-FPS sampler.

import type { HlsInstance, ShakaPlayerLike } from '#web/features/playback/video-engine';

/** Every field is optional: hls.js exposes fewer than Shaka, and both are absent
 * on direct-play. */
export interface EngineLiveStats {
  streamBitrateKbps?: number;
  estBandwidthKbps?: number;
  stalls?: number;
  bufferingSec?: number;
  bytesDownloaded?: number;
  currentCodecs?: string;
}

function kbps(bitsPerSec: number | undefined): number | undefined {
  return bitsPerSec ? Math.round(bitsPerSec / 1000) : undefined;
}

function finite(n: number | undefined): number | undefined {
  return Number.isFinite(n) ? n : undefined;
}

function shakaStats(shaka: ShakaPlayerLike): EngineLiveStats | null {
  try {
    const s = shaka.getStats();
    return {
      streamBitrateKbps: kbps(s.streamBandwidth),
      estBandwidthKbps: kbps(s.estimatedBandwidth),
      stalls: finite(s.stallsDetected),
      bufferingSec: finite(s.bufferingTime),
      bytesDownloaded: s.bytesDownloaded || undefined,
      currentCodecs: s.currentCodecs || undefined,
    };
  } catch {
    return null; // Shaka throws from getStats() before the first load resolves
  }
}

function hlsStats(hls: HlsInstance): EngineLiveStats {
  const est = hls.bandwidthEstimate;
  const level = hls.levels?.[hls.currentLevel];
  return {
    streamBitrateKbps: kbps(level?.bitrate),
    estBandwidthKbps: Number.isFinite(est) && est > 0 ? kbps(est) : undefined,
  };
}

/** Null when neither engine is attached (direct-play / native HLS). */
export function readEngineStats(
  hls: HlsInstance | null,
  shaka: ShakaPlayerLike | null,
): EngineLiveStats | null {
  if (shaka) return shakaStats(shaka);
  if (hls) return hlsStats(hls);
  return null;
}

/**
 * A stateful frame-rate sampler: call it each poll tick with the `<video>`. It
 * returns undefined until two samples exist, is lightly smoothed, and holds its
 * last value while paused.
 */
export function makeFpsSampler(now: () => number = () => performance.now()) {
  let lastFrames = 0;
  let lastT = 0;
  let fps: number | undefined;
  return (v: HTMLVideoElement | null): number | undefined => {
    const q = v?.getVideoPlaybackQuality?.();
    if (!q) return fps;
    const t = now();
    const frames = q.totalVideoFrames;
    if (!lastT) {
      lastFrames = frames;
      lastT = t;
      return fps;
    }
    const dt = (t - lastT) / 1000;
    if (dt >= 0.25) {
      const df = frames - lastFrames;
      if (df > 0) {
        const inst = df / dt;
        fps = fps ? fps * 0.6 + inst * 0.4 : inst;
      }
      lastFrames = frames;
      lastT = t;
    }
    return fps && fps > 0 ? fps : undefined;
  };
}
