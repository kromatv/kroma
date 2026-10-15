import type { WatchableApi, WatchableProbe } from '@kromatv/client/watchable';
import type { WatchReady } from '@kromatv/core';
import { createTranslator } from '@kromatv/core';
import type { WatchSubtitles } from '@kromatv/core/react';
import { describe, expect, it, vi } from 'vitest';
import { watchAudioOptions, watchMaster, watchQuality, watchSheetSubtitles } from './watchSource';

const t = createTranslator('en');

const probe = (audio: WatchableProbe['audio']): WatchableProbe => ({
  durationMs: 734_214,
  video: { codec: 'h264', width: 1920, height: 800, hdr: false, bitDepth: null },
  audio,
  subtitles: [],
  chapters: [],
});

const ready = (): WatchReady =>
  ({
    stage: 'ready',
    release: null,
    downloadId: null,
    target: { entry: { id: 'd1' }, file: { index: 3 } },
    probe: probe([]),
    ticket: { url: '/play/tok', token: 'tok', expiresAt: 1 },
  }) as unknown as WatchReady;

describe('the tracks a watch file offers', () => {
  it('names each track the probe found, in the order a master indexes them', () => {
    const tracks = probe([
      { index: 0, codec: 'eac3', channels: 6, language: 'eng' },
      { index: 4, codec: 'aac', channels: 2, language: 'fra' },
    ]).audio;

    const options = watchAudioOptions(probe(tracks), t);

    expect(options.map((o) => o.index)).toEqual([0, 1]);
    expect(options[1]?.label).toContain('French');
  });

  it('falls back to the format for a track the probe found no language for', () => {
    const options = watchAudioOptions(
      probe([{ index: 0, codec: 'aac', channels: null, language: null }]),
      t,
    );

    expect(options[0]?.label).toBe('AAC');
  });

  it('remembers no language, because a watch file has no row to remember it against', () => {
    const options = watchAudioOptions(
      probe([{ index: 0, codec: 'aac', channels: 2, language: 'fra' }]),
      t,
    );

    expect(options[0]?.prefCode).toBeNull();
  });
});

describe('the playlist a watch file plays through', () => {
  it('asks the module for a new master at the chosen audio index', () => {
    const hlsMasterUrl = vi.fn().mockReturnValue('/master.m3u8');
    const watchable = { hlsMasterUrl } as unknown as WatchableApi;

    watchMaster(watchable, ready(), 2);

    expect(hlsMasterUrl).toHaveBeenCalledWith(expect.objectContaining({ audio: 2, file: 3 }));
  });

  it("carries the anchor it asked for, so a player reads the film's time", () => {
    const hlsMasterUrl = vi.fn().mockReturnValue('/master.m3u8');
    const watchable = { hlsMasterUrl } as unknown as WatchableApi;

    const master = watchMaster(watchable, ready(), 0, 640);

    expect(master).toEqual({ uri: '/master.m3u8', anchorSec: 640 });
    expect(hlsMasterUrl).toHaveBeenCalledWith(expect.objectContaining({ startSec: 640 }));
  });
});

describe('the quality line of a watch file', () => {
  it('names the HDR system and the bit depth', () => {
    const graded: WatchableProbe = {
      ...probe([]),
      video: {
        codec: 'hevc',
        width: 3840,
        height: 1600,
        hdr: true,
        bitDepth: 10,
        hdrFormat: 'dolbyVision',
      },
    };

    expect(watchQuality(graded, t)).toBe('Auto · Dolby Vision · 10-bit');
  });
});

describe('the subtitles a watch file offers the sheet', () => {
  const subs = (over: Partial<WatchSubtitles> = {}): WatchSubtitles => ({
    tracks: [
      {
        index: 2,
        codec: 'subrip',
        language: 'fra',
        title: null,
        forced: false,
        text: true,
        url: 'http://kroma.test/subtitles/2.vtt?t=tok',
      },
    ],
    active: 2,
    pick: vi.fn(),
    cues: [{ start: 10, end: 12, text: 'Bonjour' }],
    loading: false,
    ...over,
  });

  it('lists each text track at the index its route names it by', () => {
    const sheet = watchSheetSubtitles(subs());

    expect(sheet.tracks).toEqual([
      { index: 2, language: 'fra', url: 'http://kroma.test/subtitles/2.vtt?t=tok' },
    ]);
  });

  it('reads the cue under the clock from the cues held so far', () => {
    const sheet = watchSheetSubtitles(subs());

    expect([sheet.cueAt(11), sheet.cueAt(30)]).toEqual(['Bonjour', '']);
  });

  it('never marks a track unavailable for having no cues yet', () => {
    const sheet = watchSheetSubtitles(subs({ cues: [], loading: true }));

    expect(sheet.failed.size).toBe(0);
  });
});
