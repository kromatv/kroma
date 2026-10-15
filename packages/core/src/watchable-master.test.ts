import type { WatchableFile } from '@kromatv/client/watchable';
import { describe, expect, it } from 'vitest';
import { MSE_CAPS, type PlaybackCapabilities } from './hevc';
import { bufferPlan } from './playback-buffer';
import { watchableBufferPlan, watchableDeclaration } from './watchable-master';

const CHROME: PlaybackCapabilities = {
  ...MSE_CAPS,
  hevc: false,
  hevc10bit: false,
  audio: { ...MSE_CAPS.audio, vorbis: false },
};

const FILE: WatchableFile = {
  index: 5,
  name: 'Sintel.mkv',
  sizeBytes: 5_000_000_000,
  isVideo: true,
  season: null,
  episode: null,
};

describe('watchableDeclaration', () => {
  it('names the audio this browser decodes', () => {
    expect(watchableDeclaration(CHROME).copyCodecs).toEqual(['aac', 'flac', 'opus', 'mp3']);
  });

  it('leaves HEVC out where the browser cannot decode it, so the server transcodes it', () => {
    expect(watchableDeclaration(CHROME).videoCodecs).toEqual(['h264', 'av1', 'vp9']);
  });

  it('declares HEVC where 10-bit decodes too', () => {
    const hevc = { ...CHROME, hevc: true, hevc10bit: true };

    expect(watchableDeclaration(hevc).videoCodecs).toContain('hevc');
  });

  it('leaves HEVC out where only 8-bit decodes, since a probe names no bit depth', () => {
    const eightBit = { ...CHROME, hevc: true };

    expect(watchableDeclaration(eightBit).videoCodecs).not.toContain('hevc');
  });

  it('names the H.264 depth, which no codec name carries', () => {
    const deep = { ...CHROME, h26410bit: true };

    expect(watchableDeclaration(deep).videoCodecs).toContain('h26410bit');
    expect(watchableDeclaration(CHROME).videoCodecs).not.toContain('h26410bit');
  });
});

describe('watchableBufferPlan', () => {
  it('is sized from the file bitrate, so a heavy remux buffers fewer seconds', () => {
    expect(watchableBufferPlan(FILE, 1_000_000)).toEqual(bufferPlan(40_000_000));
  });

  it('falls back to the assumed bitrate where the probe gives no duration', () => {
    expect(watchableBufferPlan(FILE, null)).toEqual(bufferPlan(null));
  });
});
