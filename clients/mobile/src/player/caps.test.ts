// Streaming guesses optimistically because a rejected direct attempt falls back
// to the HLS master; downloading cannot, so `canRawDownload` is strictly
// stronger than `decideSource`.

import type { MediaItem } from '@kroma/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rn = vi.hoisted(() => ({ os: 'ios' as 'ios' | 'android' }));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return rn.os;
    },
  },
}));

import {
  ANDROID_CAPS,
  canRawDownload,
  decideSource,
  downloadCopyCodecs,
  downloadVideoCodecs,
  IOS_CAPS,
  mobileCaps,
} from './caps';

type Track = { codec: string; default?: boolean };
interface Over {
  container?: string;
  video?: { codec: string; bitDepth?: number };
  audio?: Track[];
}

// `container` is read by PRESENCE so a case can hand over a file whose
// container the server never reported; a `?? 'mp4'` default would hide that.
const item = (over: Over = {}): MediaItem =>
  ({
    id: 'itm_1',
    container: 'container' in over ? over.container : 'mp4',
    video: over.video ?? { codec: 'h264' },
    audioTracks: over.audio ?? [{ codec: 'aac', default: true }],
    subtitles: [],
  }) as unknown as MediaItem;

beforeEach(() => {
  rn.os = 'ios';
});

describe('the capability tables', () => {
  it('picks the table for the runtime it is on', () => {
    rn.os = 'ios';
    expect(mobileCaps()).toBe(IOS_CAPS);
    rn.os = 'android';
    expect(mobileCaps()).toBe(ANDROID_CAPS);
  });

  it('claims no AV1 on either, which is a deliberate under-claim', () => {
    // A17+ only on iOS, and pre-2023 Android SoCs lack it entirely.
    expect(IOS_CAPS.av1).toBe(false);
    expect(ANDROID_CAPS.av1).toBe(false);
  });

  it('gives Dolby to AVPlayer and not to ExoPlayer', () => {
    // AC3/EAC3 decoders are TV licences an Android phone usually lacks.
    expect(IOS_CAPS.audio.ac3 && IOS_CAPS.audio.eac3).toBe(true);
    expect(ANDROID_CAPS.audio.ac3 || ANDROID_CAPS.audio.eac3).toBe(false);
  });

  it('gives VP9 and Opus to ExoPlayer and not to AVPlayer', () => {
    expect(ANDROID_CAPS.vp9 && ANDROID_CAPS.audio.opus).toBe(true);
    expect(IOS_CAPS.vp9 || IOS_CAPS.audio.opus).toBe(false);
  });

  it('claims neither DTS nor TrueHD anywhere', () => {
    for (const caps of [IOS_CAPS, ANDROID_CAPS]) {
      expect(caps.audio.dts).toBe(false);
      expect(caps.audio.truehd).toBe(false);
    }
  });
});

describe('the download codec sets', () => {
  it('asks only for audio this runtime decodes', () => {
    rn.os = 'android';
    const copy = downloadCopyCodecs();
    expect(copy).not.toContain('ac3');
    expect(copy).not.toContain('eac3');
    expect(copy).toContain('aac');
  });

  it('keeps surround where the runtime really decodes it', () => {
    rn.os = 'ios';
    expect(downloadCopyCodecs()).toContain('ac3');
  });

  it('asks only for video this runtime decodes in hardware', () => {
    rn.os = 'ios';
    expect(downloadVideoCodecs()).toEqual(['hevc', 'h264']);
    rn.os = 'android';
    expect(downloadVideoCodecs()).toEqual(['hevc', 'h264', 'vp9']);
  });

  it('never asks for a codec ffmpeg cannot stream-copy into fMP4', () => {
    for (const os of ['ios', 'android'] as const) {
      rn.os = os;
      expect(downloadCopyCodecs().every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
    }
  });
});

describe('deciding the streaming source', () => {
  it('goes direct for a plain single-audio MP4 on iOS', () => {
    rn.os = 'ios';
    expect(decideSource(item()).direct).toBe(true);
  });

  it('remuxes a container AVPlayer cannot demux', () => {
    rn.os = 'ios';
    expect(decideSource(item({ container: 'mkv' })).direct).toBe(false);
  });

  it('demuxes MKV on Android', () => {
    rn.os = 'android';
    expect(decideSource(item({ container: 'mkv' })).direct).toBe(true);
  });

  it('remuxes a MULTI-AUDIO file on iOS even when everything decodes', () => {
    rn.os = 'ios';
    const multi = item({ audio: [{ codec: 'aac', default: true }, { codec: 'ac3' }] });
    // AVFoundation exposes local audio selection only for alternate-grouped
    // tracks, so played direct the track picker would do nothing.
    expect(decideSource(multi).direct).toBe(false);
  });

  it('goes direct for the same file on Android', () => {
    rn.os = 'android';
    const multi = item({ audio: [{ codec: 'aac', default: true }, { codec: 'ac3' }] });
    // ExoPlayer selects tracks in place, and an undecodable one falls back.
    expect(decideSource(multi).direct).toBe(true);
  });

  it('remuxes when iOS cannot decode the single track it has', () => {
    rn.os = 'ios';
    expect(decideSource(item({ audio: [{ codec: 'opus', default: true }] })).direct).toBe(false);
  });

  it('remuxes a video codec the runtime does not claim', () => {
    for (const os of ['ios', 'android'] as const) {
      rn.os = os;
      expect(decideSource(item({ video: { codec: 'av1' } })).direct).toBe(false);
    }
  });

  it('always reports whether the master would need AAC', () => {
    rn.os = 'android';
    const surround = item({ container: 'mkv', audio: [{ codec: 'eac3', default: true }] });
    expect(decideSource(surround).aacMaster).toBe(true);
    expect(decideSource(item()).aacMaster).toBe(false);
  });

  it('treats a missing container as undemuxable rather than guessing', () => {
    rn.os = 'ios';
    expect(decideSource(item({ container: undefined })).direct).toBe(false);
  });

  it('is case-insensitive about the container', () => {
    rn.os = 'ios';
    // ffprobe reports `MOV` on some files and `mov` on others.
    expect(decideSource(item({ container: 'MP4' })).direct).toBe(true);
  });

  it('takes the only audio track when none is flagged default', () => {
    rn.os = 'ios';
    expect(decideSource(item({ audio: [{ codec: 'aac' }] })).direct).toBe(true);
    expect(decideSource(item({ audio: [{ codec: 'opus' }] })).direct).toBe(false);
  });
});

describe('deciding whether the raw file can be downloaded', () => {
  it('allows a file whose every part is decodable', () => {
    rn.os = 'ios';
    expect(canRawDownload(item())).toBe(true);
  });

  it('is STRICTER than the streaming decision', () => {
    rn.os = 'android';
    const undecodable = item({ container: 'mkv', audio: [{ codec: 'dts', default: true }] });
    expect(decideSource(undecodable).direct).toBe(true);
    expect(canRawDownload(undecodable)).toBe(false);
  });

  it('refuses a container the runtime cannot demux', () => {
    rn.os = 'ios';
    expect(canRawDownload(item({ container: 'mkv' }))).toBe(false);
  });

  it('refuses a video codec the runtime cannot decode', () => {
    rn.os = 'android';
    expect(canRawDownload(item({ container: 'mp4', video: { codec: 'av1' } }))).toBe(false);
  });

  it('refuses a file with NO audio track at all', () => {
    rn.os = 'android';
    expect(canRawDownload(item({ audio: [] }))).toBe(false);
  });

  it('refuses a multi-audio file on iOS, matching the streaming rule', () => {
    rn.os = 'ios';
    const multi = item({ audio: [{ codec: 'aac', default: true }, { codec: 'aac' }] });
    expect(canRawDownload(multi)).toBe(false);
  });

  it('allows a multi-audio file on Android when EVERY track decodes', () => {
    rn.os = 'android';
    const multi = item({
      container: 'mkv',
      audio: [{ codec: 'aac', default: true }, { codec: 'opus' }],
    });
    expect(canRawDownload(multi)).toBe(true);
  });

  it('refuses when only ONE of several tracks is undecodable', () => {
    rn.os = 'android';
    const mixed = item({
      container: 'mkv',
      audio: [{ codec: 'aac', default: true }, { codec: 'truehd' }],
    });
    expect(canRawDownload(mixed)).toBe(false);
  });

  it('refuses a track with no codec reported', () => {
    rn.os = 'android';
    expect(canRawDownload(item({ audio: [{ codec: '' as string }] }))).toBe(false);
  });

  it('refuses a file whose container the server never reported', () => {
    rn.os = 'ios';
    expect(canRawDownload(item({ container: undefined }))).toBe(false);
  });
});
