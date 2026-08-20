import type { MediaItem } from '@kroma/client';
import { describe, expect, it } from 'vitest';
import {
  audioSupport,
  canDecodeAudioCodec,
  canSeamlessAudioSwitch,
  masterNeedsAac,
} from './audio-support';
import { canDirectPlay, MSE_CAPS } from './directplay';
import { makeItem, track } from './directplay.fixture';

describe('canDirectPlay', () => {
  it('refuses 10-bit HEVC on an engine that only decodes 8-bit', () => {
    const item = makeItem({ videoCodec: 'hevc', bitDepth: 10, audio: [] });
    expect(canDirectPlay(item, { ...MSE_CAPS, hevc10bit: false })).toEqual({
      canDirectPlay: false,
      messageKey: 'player.hevc10Unsupported',
    });
    expect(canDirectPlay(item, MSE_CAPS).canDirectPlay).toBe(true);
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
    });
    const h264 = makeItem({ videoCodec: 'h264', audio: [] });
    expect(canDirectPlay(h264, { ...MSE_CAPS, h264: false })).toEqual({
      canDirectPlay: false,
      messageKey: 'player.h264Unsupported',
    });
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
    });
    expect(audioSupport(item).canPlay).toBe(false);
    expect(canDecodeAudioCodec('aac')).toBe(false);
    expect(canSeamlessAudioSwitch(item)).toBe(false);
    expect(masterNeedsAac(item)).toBe(true);
  });
});
