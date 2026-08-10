import type { AudioTrack, Translate } from '@kroma/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MovieView } from '../../shared/lib/api';
import { buildWebStats, type WebStatsInput } from './web-stats';

// Echoes the key + vars, so an assertion names the catalog string a field used
// without depending on the real catalog.
const t: Translate = ((key: string, vars?: unknown) =>
  vars ? `${key}(${JSON.stringify(vars)})` : key) as Translate;

const item = {
  title: 'Blade Runner 2049',
  container: 'mkv',
  video: { codec: 'hevc', bitDepth: 10, hdr: true, width: 3840, height: 2160 },
  audio: { codec: 'eac3' },
} as unknown as MovieView;

const audioTracks: AudioTrack[] = [
  { index: 0, codec: 'eac3', channels: 6, language: 'fr', default: true } as AudioTrack,
  { index: 1, codec: 'aac', channels: 2, language: 'en', default: false } as AudioTrack,
];

// v: null keeps this in the node env (no <video>): metrics degrade to metadata.
const input = (over: Partial<WebStatsInput> = {}): WebStatsInput =>
  ({
    v: null,
    item,
    cur: 40,
    dur: 3600,
    bufEnd: 100,
    useHls: true,
    aac: false,
    anchor: 12,
    baseSec: 10,
    audioTracks,
    audioIndex: 0,
    bytes: 1_000_000_000,
    t,
    ...over,
  }) as WebStatsInput;

describe('buildWebStats', () => {
  it('summarises an HLS copy stream from the item metadata', () => {
    const s = buildWebStats(input());
    expect(s.mode).toBe('HLS · copy');
    expect(s.resolution).toBe('3840×2160');
    expect(s.videoCodec).toBe('HEVC 10-bit HDR');
    expect(s.audioFormat).toBe('EAC3 6.0 (fr)');
    expect(s.dropped).toBe('0 / 0');
  });

  it('labels the mode AAC when the audio is transcoded', () => {
    expect(buildWebStats(input({ aac: true })).mode).toBe('HLS · AAC');
  });

  it('reports Direct mode with no bitrate when not using HLS / no bytes', () => {
    const s = buildWebStats(input({ useHls: false, bytes: 0 }));
    expect(s.mode).toBe('Direct');
    expect(s.bitrate).toBeUndefined();
  });

  it('computes an average bitrate from bytes and duration', () => {
    // (1e9 bytes * 8) / 3600 s / 1e6 ≈ 2.22 Mb/s
    expect(buildWebStats(input()).bitrate).toBe('2.22 Mb/s');
  });

  it('computes buffer-ahead from bufEnd - cur (clamped at 0)', () => {
    expect(buildWebStats(input({ cur: 40, bufEnd: 100 })).buffer).toBe(
      'stats.bufferAhead({"seconds":"60.0"})',
    );
    expect(buildWebStats(input({ cur: 90, bufEnd: 50 })).buffer).toBe(
      'stats.bufferAhead({"seconds":"0.0"})',
    );
  });

  it('omits the resolution when there are no video dimensions', () => {
    const noDims = { ...item, video: null } as unknown as MovieView;
    expect(buildWebStats(input({ item: noDims })).resolution).toBeUndefined();
  });

  it('selects the audio track by index, falling back to the first', () => {
    expect(buildWebStats(input({ audioIndex: 1 })).audioFormat).toBe('AAC 2.0 (en)');
    expect(buildWebStats(input({ audioIndex: 99 })).audioFormat).toBe('EAC3 6.0 (fr)');
  });

  it('includes an anchor diagnostics row only for HLS', () => {
    const labels = (s: ReturnType<typeof buildWebStats>) => (s.extra ?? []).map((r) => r.label);
    expect(labels(buildWebStats(input({ useHls: true })))).toContain('stats.anchor');
    expect(labels(buildWebStats(input({ useHls: false })))).not.toContain('stats.anchor');
  });

  it('reports the container and default volume in the extra rows', () => {
    const rows = buildWebStats(input()).extra ?? [];
    expect(rows.find((r) => r.label === 'stats.container')?.value).toBe('MKV');
    expect(rows.find((r) => r.label === 'stats.volume')?.value).toBe('100%');
  });

  it('sets a formatted fps headline when the sampler reports one', () => {
    expect(buildWebStats(input({ fps: 23.976 })).fps).toBe('23.98 fps');
    expect(buildWebStats(input({ fps: 0 })).fps).toBeUndefined();
    expect(buildWebStats(input()).fps).toBeUndefined();
  });

  it('adds live engine rows (bitrate, bandwidth, stalls, downloaded, codecs)', () => {
    const rows =
      buildWebStats(
        input({
          engine: {
            streamBitrateKbps: 8200,
            estBandwidthKbps: 512,
            stalls: 2,
            bufferingSec: 3.25,
            bytesDownloaded: 1_500_000_000,
            currentCodecs: 'avc1.640028,mp4a.40.2',
          },
        }),
      ).extra ?? [];
    const val = (label: string) => rows.find((r) => r.label === label)?.value;
    expect(val('stats.streamBitrate')).toBe('8.20 Mb/s');
    expect(val('stats.bandwidth')).toBe('512 kb/s');
    expect(val('stats.stalls')).toBe('2 (3.3s)');
    expect(val('stats.downloaded')).toBe('1.50 Go');
    expect(val('stats.codecs')).toBe('avc1.640028,mp4a.40.2');
  });

  it('omits engine rows entirely when no engine metrics are present', () => {
    const labels = (buildWebStats(input()).extra ?? []).map((r) => r.label);
    expect(labels).not.toContain('stats.streamBitrate');
    expect(labels).not.toContain('stats.bandwidth');
    expect(labels).not.toContain('stats.stalls');
  });

  it('always emits a buffer meter, adding bandwidth/bitrate when the engine reports them', () => {
    const bufferOnly = buildWebStats(input()).meters ?? [];
    expect(bufferOnly.map((m) => m.key)).toEqual(['buffer']);
    expect(bufferOnly[0]?.value).toBe(60);

    const withEngine =
      buildWebStats(input({ engine: { estBandwidthKbps: 512, streamBitrateKbps: 8200 } })).meters ??
      [];
    expect(withEngine.map((m) => m.key)).toEqual(['bandwidth', 'bitrate', 'buffer']);
    expect(withEngine.find((m) => m.key === 'bandwidth')?.display).toBe('512 kb/s');
    expect(withEngine.find((m) => m.key === 'bitrate')?.value).toBe(8200);
  });

  it('puts bandwidth and bitrate on one axis, with bandwidth owning the band', () => {
    const meters =
      buildWebStats(input({ engine: { estBandwidthKbps: 512, streamBitrateKbps: 8200 } })).meters ??
      [];
    const bandwidth = meters.find((m) => m.key === 'bandwidth');
    const bitrate = meters.find((m) => m.key === 'bitrate');
    expect(bandwidth?.chart).toBe('throughput');
    expect(bitrate?.chart).toBe('throughput');
    expect(bandwidth?.band).toBe(true);
    expect(bitrate?.band).toBeUndefined();
  });

  it('keeps buffer off the throughput axis and gives it a low-water reference', () => {
    const buffer = (buildWebStats(input()).meters ?? []).find((m) => m.key === 'buffer');
    expect(buffer?.chart).toBeUndefined();
    expect(buffer?.reference?.value).toBe(10);
  });

  it('sets no colours, leaving the panel to assign the validated palette', () => {
    const meters =
      buildWebStats(input({ engine: { estBandwidthKbps: 512, streamBitrateKbps: 8200 } })).meters ??
      [];
    expect(meters.every((m) => m.color === undefined)).toBe(true);
  });

  it('falls back to the file audio, then to a dash, when the track says nothing', () => {
    expect(buildWebStats(input({ audioTracks: [] })).audioFormat).toBe('EAC3');
    const noAudio = { ...item, audio: null } as unknown as MovieView;
    expect(buildWebStats(input({ audioTracks: [], item: noAudio })).audioFormat).toBe('-');
    expect(
      buildWebStats(input({ audioTracks: [{ index: 0, codec: 'aac' } as AudioTrack] })).audioFormat,
    ).toBe('AAC');
  });

  it('omits an engine figure it has not measured, and scales the byte counter', () => {
    const rows =
      buildWebStats(
        input({
          engine: {
            streamBitrateKbps: 0,
            estBandwidthKbps: 0,
            stalls: 3,
            bytesDownloaded: 1_500_000,
            currentCodecs: '',
          },
        }),
      ).extra ?? [];
    const val = (label: string) => rows.find((r) => r.label === label)?.value;
    expect(val('stats.streamBitrate')).toBeUndefined();
    expect(val('stats.bandwidth')).toBeUndefined();
    expect(val('stats.stalls')).toBe('3');
    expect(val('stats.downloaded')).toBe('1.5 Mo');
    expect(val('stats.codecs')).toBeUndefined();
  });

  it('reports a sub-megabyte download in kilobytes', () => {
    const rows = buildWebStats(input({ engine: { bytesDownloaded: 4_400 } })).extra ?? [];
    expect(rows.find((r) => r.label === 'stats.downloaded')?.value).toBe('4 Ko');
  });

  it('shows a nonsense negative reading as absent rather than a negative rate', () => {
    const meters =
      buildWebStats(input({ engine: { estBandwidthKbps: -5, streamBitrateKbps: -9 } })).meters ??
      [];
    expect(meters.find((m) => m.key === 'bandwidth')?.display).toBe('-');
    expect(meters.find((m) => m.key === 'bitrate')?.display).toBe('-');
  });
});

describe('buildWebStats against a live element', () => {
  const videoEl = (over: Record<string, unknown> = {}) =>
    ({
      videoWidth: 1920,
      videoHeight: 1080,
      clientWidth: 800,
      clientHeight: 450,
      volume: 0.5,
      muted: true,
      playbackRate: 1.5,
      currentTime: 33,
      readyState: 4,
      networkState: 2,
      getVideoPlaybackQuality: () => ({ droppedVideoFrames: 3, totalVideoFrames: 900 }),
      ...over,
    }) as unknown as HTMLVideoElement;

  const rowValue = (s: ReturnType<typeof buildWebStats>, label: string) =>
    (s.extra ?? []).find((r) => r.label === label)?.value;

  afterEach(() => vi.unstubAllGlobals());

  it('prefers the decoded frame size, the CSS box in device pixels, and the live volume', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    vi.stubGlobal('navigator', { connection: { downlink: 12, effectiveType: '4g' } });
    const s = buildWebStats(input({ v: videoEl() }));

    expect(s.resolution).toBe('1920×1080');
    expect(s.dropped).toBe('3 / 900');
    expect(rowValue(s, 'stats.display')).toBe('1600×900 @2x');
    expect(rowValue(s, 'stats.volume')).toBe('50%stats.volumeMuted');
    expect(rowValue(s, 'stats.speed')).toBe('1.50×');
    expect(rowValue(s, 'stats.state')).toBe('HAVE_ENOUGH · NET_LOADING');
    expect(rowValue(s, 'stats.connection')).toBe('12 Mb/s · 4g');
    expect(rowValue(s, 'stats.position')).toBe('0:40 · rel 33s');
  });

  it('omits the speed row at normal rate and names an unlabelled connection tier', () => {
    vi.stubGlobal('navigator', { connection: { downlink: 3.5 } });
    const s = buildWebStats(input({ v: videoEl({ playbackRate: 1, muted: false }) }));
    expect(rowValue(s, 'stats.speed')).toBeUndefined();
    expect(rowValue(s, 'stats.volume')).toBe('50%');
    expect(rowValue(s, 'stats.connection')).toBe('3.5 Mb/s · ');
  });

  it('reports no connection where the browser exposes none', () => {
    vi.stubGlobal('navigator', undefined);
    expect(rowValue(buildWebStats(input()), 'stats.connection')).toBe('-');
  });
});
