import type { MediaItem } from '@kroma/client';
import { describe, expect, it } from 'vitest';
import {
  audioSupport,
  canDecodeAudioCodec,
  canSeamlessAudioSwitch,
  masterNeedsAac,
} from './audio-support';
import {
  beyondDecoder,
  canDirectPlay,
  ceilingLabel,
  decoderMaxFrame,
  frameLabel,
  MSE_CAPS,
  overrunLabels,
} from './directplay';
import { makeItem, track } from './directplay.fixture';

describe('canDirectPlay', () => {
  it('refuses 10-bit HEVC on an engine that only decodes 8-bit', () => {
    const item = makeItem({ videoCodec: 'hevc', bitDepth: 10, audio: [] });
    expect(canDirectPlay(item, { ...MSE_CAPS, hevc10bit: false })).toEqual({
      canDirectPlay: false,
      messageKey: 'player.hevc10Unsupported',
      hintKey: 'player.codecUnsupportedHint',
    });
    expect(canDirectPlay(item, MSE_CAPS).canDirectPlay).toBe(true);
  });

  it('refuses a picture larger than the decoder that would draw it', () => {
    const uhd = makeItem({ videoCodec: 'hevc', width: 3840, height: 2160, audio: [] });
    const caps = { ...MSE_CAPS, frameLimits: { hevc: { width: 1920, height: 1920 } } };

    expect(canDirectPlay(uhd, caps)).toEqual({
      canDirectPlay: false,
      messageKey: 'player.frameTooLarge',
      messageVars: { source: '4K', ceiling: '1080p' },
      hintKey: 'player.frameTooLargeHint',
    });
    expect(canDirectPlay(uhd, MSE_CAPS).canDirectPlay).toBe(true);
  });

  it('gates each codec on its own ceiling and lets an undeclared one through', () => {
    const caps = { ...MSE_CAPS, frameLimits: { hevc: { width: 1920, height: 1920 } } };
    const uhdH264 = makeItem({ videoCodec: 'h264', width: 3840, height: 2160, audio: [] });
    const hd = makeItem({ videoCodec: 'hevc', width: 1920, height: 1080, audio: [] });
    const unprobedSize = makeItem({ videoCodec: 'hevc', audio: [] });

    expect(canDirectPlay(uhdH264, caps).canDirectPlay).toBe(true);
    expect(canDirectPlay(hd, caps).canDirectPlay).toBe(true);
    expect(canDirectPlay(unprobedSize, caps).canDirectPlay).toBe(true);
  });

  it('assumes an unprobed or unlisted video codec plays', () => {
    const unprobed = { container: 'mp4', audioTracks: [] } as unknown as MediaItem;
    expect(canDirectPlay(unprobed, MSE_CAPS)).toEqual({
      canDirectPlay: true,
      messageKey: 'player.directPlayUnknown',
    });
    const mpeg2 = makeItem({ videoCodec: 'mpeg2video', audio: [] });
    expect(canDirectPlay(mpeg2, MSE_CAPS).messageKey).toBe('player.directPlayUnknown');
  });

  it('reads VP9 and H.264 off the engine table rather than assuming them', () => {
    const vp9 = makeItem({ videoCodec: 'vp9', audio: [] });
    expect(canDirectPlay(vp9, MSE_CAPS)).toEqual({
      canDirectPlay: true,
      messageKey: 'player.directPlayVp9',
    });
    expect(canDirectPlay(vp9, { ...MSE_CAPS, vp9: false })).toEqual({
      canDirectPlay: false,
      messageKey: 'player.vp9Unsupported',
      hintKey: 'player.codecUnsupportedHint',
    });
    const h264 = makeItem({ videoCodec: 'h264', audio: [] });
    expect(canDirectPlay(h264, { ...MSE_CAPS, h264: false })).toEqual({
      canDirectPlay: false,
      messageKey: 'player.h264Unsupported',
      hintKey: 'player.codecUnsupportedHint',
    });
  });
});

describe('frameLabel', () => {
  it('names a picture off whichever axis is larger', () => {
    expect(frameLabel({ width: 3840, height: 2160 })).toBe('4K');
    expect(frameLabel({ width: 3840, height: 1604 })).toBe('4K');
    expect(frameLabel({ width: 1920, height: 1080 })).toBe('1080p');
    expect(frameLabel({ width: 720, height: 576 })).toBe('480p');
  });
});

describe('ceilingLabel', () => {
  it('names a decoder by the largest picture that fits inside it', () => {
    // The Chromecast HD declares a square limit: 1440p is 2560 wide and does
    // not fit in 1920 columns, so this is a 1080p decoder.
    expect(ceilingLabel({ width: 1920, height: 1920 })).toBe('1080p');
    expect(ceilingLabel({ width: 4096, height: 4096 })).toBe('4K');
    expect(ceilingLabel({ width: 1280, height: 720 })).toBe('720p');
    expect(ceilingLabel({ width: 640, height: 480 })).toBe('480p');
  });
});

describe('beyondDecoder', () => {
  it('names the ceiling a frame is over, and nothing when it fits', () => {
    const caps = { ...MSE_CAPS, frameLimits: { hevc: { width: 1920, height: 1920 } } };
    const uhd = makeItem({ videoCodec: 'hevc', width: 3840, height: 2160, audio: [] });
    const wide = makeItem({ videoCodec: 'hevc', width: 3840, height: 1600, audio: [] });

    expect(beyondDecoder(uhd, caps)).toEqual({
      frame: { width: 3840, height: 2160 },
      limit: { width: 1920, height: 1920 },
    });
    expect(beyondDecoder(wide, caps)).not.toBeNull();
    expect(beyondDecoder(uhd, MSE_CAPS)).toBeNull();
  });
});

describe('overrunLabels', () => {
  it('names the two tiers when they differ', () => {
    expect(
      overrunLabels({ frame: { width: 3840, height: 2160 }, limit: { width: 1920, height: 1920 } }),
    ).toEqual({ source: '4K', ceiling: '1080p' });
  });

  it('gives the frame its own size rather than saying 1080p twice', () => {
    // A 2048x858 scope print overruns a 1920x1920 decoder on width, and both
    // sides of the sentence would otherwise read 1080p.
    expect(
      overrunLabels({ frame: { width: 2048, height: 858 }, limit: { width: 1920, height: 1920 } }),
    ).toEqual({ source: '2048x858', ceiling: '1080p' });
  });
});

describe('decoderMaxFrame', () => {
  // A Fire TV Stick 4K: H.264 stops at 1080p, HEVC reaches 4K.
  const MIXED = {
    ...MSE_CAPS,
    frameLimits: {
      h264: { width: 1920, height: 1088 },
      hevc: { width: 3840, height: 2160 },
    },
  };

  it('declares the ceiling that holds for the re-encode as well as the copy', () => {
    const uhdHevc = makeItem({ videoCodec: 'hevc', width: 3840, height: 2160, audio: [] });

    expect(decoderMaxFrame(uhdHevc, MIXED)).toEqual({ width: 1920, height: 1088 });
  });

  it('falls to the re-encode ceiling for a codec the device never declared', () => {
    const av1 = makeItem({ videoCodec: 'av1', width: 3840, height: 2160, audio: [] });

    expect(decoderMaxFrame(av1, MIXED)).toEqual({ width: 1920, height: 1088 });
    expect(decoderMaxFrame(av1, MSE_CAPS)).toBeUndefined();
  });
});

describe('the probed runtime as the default engine', () => {
  it('decodes nothing under a runtime with neither MediaSource nor a video element', () => {
    const item = makeItem({
      videoCodec: 'h264',
      audio: [track({ index: 0, codec: 'aac' }), track({ index: 1, codec: 'aac' })],
    });
    expect(canDirectPlay(item)).toEqual({
      canDirectPlay: false,
      messageKey: 'player.h264Unsupported',
      hintKey: 'player.codecUnsupportedHint',
    });
    expect(audioSupport(item).canPlay).toBe(false);
    expect(canDecodeAudioCodec('aac')).toBe(false);
    expect(canSeamlessAudioSwitch(item)).toBe(false);
    expect(masterNeedsAac(item)).toBe(true);
  });
});
