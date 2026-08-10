import type { AudioTrack, MediaItem, Translate } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import { buildLeanStats, type LeanStatsInput } from './lean-stats';

const t: Translate = ((key: string, vars?: unknown) =>
  vars ? `${key}(${JSON.stringify(vars)})` : key) as Translate;

const item = {
  title: 'Interstellar',
  container: 'mkv',
  video: { codec: 'hevc', bitDepth: 10, hdr: true, width: 3840, height: 1600 },
} as unknown as MediaItem;

const audioTracks: AudioTrack[] = [
  { index: 0, codec: 'eac3', channels: 6, language: 'en', default: true } as AudioTrack,
  { index: 5, codec: 'ac3', channels: 2, language: 'fr', default: false } as AudioTrack,
];

const input = (over: Partial<LeanStatsInput> = {}): LeanStatsInput =>
  ({
    item,
    cur: 30,
    dur: 8880,
    bufEnd: 45,
    audioTracks,
    audioIndex: 0,
    video: null, // native plane (avplay/mpv/exo): no decode counters
    mode: 'AVPlay',
    t,
    ...over,
  }) as LeanStatsInput;

describe('buildLeanStats', () => {
  it('builds a metadata snapshot for a native surface', () => {
    const s = buildLeanStats(input());
    expect(s.mode).toBe('AVPlay');
    expect(s.resolution).toBe('3840×1600');
    expect(s.videoCodec).toBe('HEVC 10-bit HDR');
    expect(s.audioFormat).toBe('EAC3 6.0 (en)');
    expect(s.dropped).toBeUndefined(); // no <video>, no frame counters
  });

  it('formats buffer-ahead as (bufEnd - cur), clamped at 0', () => {
    expect(buildLeanStats(input({ cur: 30, bufEnd: 45 })).buffer).toBe(
      'stats.bufferAhead({"seconds":"15.0"})',
    );
    expect(buildLeanStats(input({ cur: 60, bufEnd: 45 })).buffer).toBe(
      'stats.bufferAhead({"seconds":"0.0"})',
    );
  });

  it('selects the audio track by its index, falling back to the first', () => {
    expect(buildLeanStats(input({ audioIndex: 5 })).audioFormat).toBe('AC3 2.0 (fr)');
    expect(buildLeanStats(input({ audioIndex: 99 })).audioFormat).toBe('EAC3 6.0 (en)');
  });

  it('has no audio format when there are no audio tracks', () => {
    expect(buildLeanStats(input({ audioTracks: [] })).audioFormat).toBeUndefined();
  });

  it('omits resolution / codec when the item carries no video metadata', () => {
    const noVideo = { ...item, video: null } as unknown as MediaItem;
    const s = buildLeanStats(input({ item: noVideo }));
    expect(s.resolution).toBeUndefined();
    expect(s.videoCodec).toBeUndefined();
  });

  it('emits title, upper-cased container and a position row in extra', () => {
    const rows = buildLeanStats(input()).extra ?? [];
    expect(rows.find((r) => r.label === 'stats.title2')?.value).toBe('Interstellar');
    expect(rows.find((r) => r.label === 'stats.container')?.value).toBe('MKV');
    expect(rows.find((r) => r.label === 'stats.position')?.value).toBe('30s / 8880s');
  });

  it('names a plain 8-bit SDR stream without inventing depth or HDR', () => {
    const plain = {
      ...item,
      video: { codec: 'h264', width: 1920, height: 1080 },
    } as unknown as MediaItem;
    const s = buildLeanStats(input({ item: plain }));
    expect(s.videoCodec).toBe('H264');
  });

  it('names an audio track that says nothing but its codec', () => {
    const bare = [{ index: 0, codec: 'aac', default: true }] as unknown as AudioTrack[];
    expect(buildLeanStats(input({ audioTracks: bare })).audioFormat).toBe('AAC');
  });

  it('reports dropped frames on a surface that counts them', () => {
    const video = {
      videoWidth: 1920,
      videoHeight: 800,
      getVideoPlaybackQuality: () => ({ droppedVideoFrames: 7, totalVideoFrames: 4200 }),
    };
    const s = buildLeanStats(input({ video }));
    expect(s.dropped).toBe('7 / 4200');
    expect(s.resolution).toBe('1920×800');
  });

  it('leaves the container row blank rather than saying "undefined"', () => {
    const noContainer = { ...item, container: null } as unknown as MediaItem;
    const rows = buildLeanStats(input({ item: noContainer })).extra ?? [];
    expect(rows.find((r) => r.label === 'stats.container')?.value).toBe('');
  });

  it('appends surface-specific extra rows after the shared ones', () => {
    const rows =
      buildLeanStats(input({ extra: [{ label: 'stats.speed', value: '1.5×', group: 'Playback' }] }))
        .extra ?? [];
    expect(rows.at(-1)).toEqual({ label: 'stats.speed', value: '1.5×', group: 'Playback' });
  });
});
