// The rule pinned here: a figure the engine has not measured yet reads as ABSENT
// (row omitted), never as a confident zero.

import { describe, expect, it, vi } from 'vitest';
import { makeFpsSampler, readEngineStats } from './engine-stats';

type Shaka = Parameters<typeof readEngineStats>[1];
type Hls = Parameters<typeof readEngineStats>[0];

const shakaWith = (stats: Record<string, unknown>) =>
  ({ getStats: () => stats }) as unknown as NonNullable<Shaka>;

const hlsWith = (over: Record<string, unknown>) => over as unknown as NonNullable<Hls>;

describe('readEngineStats', () => {
  it('is null on direct play, where no engine is attached', () => {
    expect(readEngineStats(null, null)).toBeNull();
  });

  it('reads the rich Shaka snapshot, in friendly units', () => {
    const stats = readEngineStats(
      null,
      shakaWith({
        streamBandwidth: 5_400_000,
        estimatedBandwidth: 12_000_000,
        stallsDetected: 2,
        bufferingTime: 1.5,
        bytesDownloaded: 4096,
        currentCodecs: 'avc1.640028,mp4a.40.2',
      }),
    );
    expect(stats).toEqual({
      streamBitrateKbps: 5400,
      estBandwidthKbps: 12_000,
      stalls: 2,
      bufferingSec: 1.5,
      bytesDownloaded: 4096,
      currentCodecs: 'avc1.640028,mp4a.40.2',
    });
  });

  // Shaka reports zeros and NaNs until its first sample.
  it('drops the zeros and NaNs an unmeasured engine reports', () => {
    const stats = readEngineStats(
      null,
      shakaWith({
        streamBandwidth: 0,
        estimatedBandwidth: 0,
        stallsDetected: Number.NaN,
        bufferingTime: Number.NaN,
        bytesDownloaded: 0,
        currentCodecs: '',
      }),
    );
    expect(stats).toEqual({
      streamBitrateKbps: undefined,
      estBandwidthKbps: undefined,
      stalls: undefined,
      bufferingSec: undefined,
      bytesDownloaded: undefined,
      currentCodecs: undefined,
    });
  });

  // Shaka throws from getStats() until its first load resolves.
  it('survives a Shaka that throws before its first load', () => {
    const shaka = {
      getStats: () => {
        throw new Error('not loaded');
      },
    } as unknown as NonNullable<Shaka>;
    expect(readEngineStats(null, shaka)).toBeNull();
  });

  it('reads the current level and the ABR estimate from hls.js', () => {
    const stats = readEngineStats(
      hlsWith({
        bandwidthEstimate: 9_000_000,
        currentLevel: 1,
        levels: [{}, { bitrate: 3_000_000 }],
      }),
      null,
    );
    expect(stats).toEqual({ streamBitrateKbps: 3000, estBandwidthKbps: 9000 });
  });

  it('omits the hls.js estimate before it has measured anything', () => {
    expect(
      readEngineStats(hlsWith({ bandwidthEstimate: 0, currentLevel: -1, levels: [] }), null),
    ).toEqual({ streamBitrateKbps: undefined, estBandwidthKbps: undefined });
  });

  it('prefers Shaka when both engines are somehow attached', () => {
    const stats = readEngineStats(
      hlsWith({ bandwidthEstimate: 1_000_000, currentLevel: 0, levels: [{ bitrate: 1_000_000 }] }),
      shakaWith({ streamBandwidth: 5_000_000 }),
    );
    expect(stats?.streamBitrateKbps).toBe(5000);
  });
});

describe('makeFpsSampler', () => {
  const video = (totalVideoFrames: number) =>
    ({ getVideoPlaybackQuality: () => ({ totalVideoFrames }) }) as unknown as HTMLVideoElement;

  it('has no answer until it has two samples to compare', () => {
    let t = 1000;
    const sample = makeFpsSampler(() => t);
    expect(sample(video(0))).toBeUndefined();
    t += 1000;
    expect(sample(video(24))).toBe(24);
  });

  it('reports nothing when the element exposes no quality counters', () => {
    const sample = makeFpsSampler(() => 1000);
    expect(sample(null)).toBeUndefined();
    expect(sample({} as HTMLVideoElement)).toBeUndefined();
  });

  it('ignores a tick that arrives too soon to measure', () => {
    let t = 1000;
    const sample = makeFpsSampler(() => t);
    sample(video(0));
    t += 1000;
    expect(sample(video(24))).toBe(24);
    t += 100; // under the 0.25s floor
    expect(sample(video(30))).toBe(24);
  });

  it('holds the last value while no frames advance', () => {
    let t = 1000;
    const sample = makeFpsSampler(() => t);
    sample(video(0));
    t += 1000;
    expect(sample(video(24))).toBe(24);
    t += 1000;
    expect(sample(video(24))).toBe(24);
  });

  it('smooths towards a new rate rather than snapping to it', () => {
    let t = 1000;
    const sample = makeFpsSampler(() => t);
    sample(video(0));
    t += 1000;
    expect(sample(video(60))).toBe(60);
    t += 1000;
    const next = sample(video(90)) as number;
    expect(next).toBeGreaterThan(30);
    expect(next).toBeLessThan(60);
  });

  it('defaults its clock to performance.now', () => {
    vi.stubGlobal('performance', { now: () => 5000 });
    const sample = makeFpsSampler();
    expect(sample(video(0))).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
