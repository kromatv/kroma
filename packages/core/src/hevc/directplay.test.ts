import type { AudioTrack, MediaItem } from '@kroma/client';
import { describe, expect, it } from 'vitest';
import {
  audioSupport,
  audioTrackId,
  audioTracksOf,
  avplayDirectPlayable,
  canDecodeAudioCodec,
  canDirectPlay,
  canSeamlessAudioSwitch,
  MSE_CAPS,
  masterNeedsAac,
  NATIVE_TV_CAPS,
  nativeDirectPlayable,
  type PlayEnv,
  resolveAudioRelativeIndex,
  SAFARI_CAPS,
  selectEngine,
} from './directplay';

function track(p: Partial<AudioTrack> & { index: number }): AudioTrack {
  return {
    index: p.index,
    codec: p.codec ?? 'aac',
    channels: p.channels ?? null,
    language: p.language ?? null,
    title: p.title ?? null,
    default: p.default ?? false,
  };
}

function makeItem(p: {
  container?: string;
  videoCodec?: string;
  bitDepth?: number;
  audio: AudioTrack[];
}): MediaItem {
  return {
    container: p.container ?? 'mp4',
    video: { codec: p.videoCodec ?? 'h264', bitDepth: p.bitDepth ?? 8 },
    audio: p.audio[0] ?? null,
    audioTracks: p.audio,
    durationMs: 1000,
  } as unknown as MediaItem;
}

const EN_51 = (index: number) => track({ index, language: 'en', channels: 6, codec: 'eac3' });
const FR_51 = (index: number) => track({ index, language: 'fr', channels: 6, codec: 'eac3' });
const FR_COMMENTARY = (index: number) =>
  track({ index, language: 'fr', title: 'Commentary', channels: 2, codec: 'aac' });

const UNPROBED = {
  video: { codec: 'h264', bitDepth: 8 },
  audio: null,
  audioTracks: [],
  durationMs: 1000,
} as unknown as MediaItem;

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

describe('audioSupport', () => {
  it('says nothing about an item whose audio was never probed', () => {
    expect(audioSupport(makeItem({ audio: [] }), MSE_CAPS)).toEqual({
      canPlay: true,
      messageKey: null,
    });
  });

  it('does not block on a codec the table has no entry for', () => {
    const pcm = makeItem({ audio: [track({ index: 0, codec: 'pcm_s16le' })] });
    expect(audioSupport(pcm, MSE_CAPS)).toEqual({ canPlay: true, messageKey: null });
  });

  it('names the codec that would otherwise play as silence', () => {
    const eac3 = makeItem({ audio: [track({ index: 0, codec: 'eac3' })] });
    expect(audioSupport(eac3, MSE_CAPS)).toEqual({
      canPlay: false,
      messageKey: 'player.audioUnsupported',
      messageVars: { codec: 'EAC3' },
    });
    expect(audioSupport(eac3, SAFARI_CAPS)).toEqual({ canPlay: true, messageKey: null });
  });
});

describe('canDecodeAudioCodec', () => {
  it('assumes an absent or unlisted codec decodes', () => {
    expect(canDecodeAudioCodec(undefined, MSE_CAPS)).toBe(true);
    expect(canDecodeAudioCodec('pcm_s16le', MSE_CAPS)).toBe(true);
  });

  it('answers from the engine table for a listed codec', () => {
    expect(canDecodeAudioCodec('eac3', MSE_CAPS)).toBe(false);
    expect(canDecodeAudioCodec('eac3', SAFARI_CAPS)).toBe(true);
  });
});

describe('audioTracksOf', () => {
  it('numbers an older payload that carries only the representative track', () => {
    const legacy = {
      container: 'mp4',
      video: { codec: 'h264' },
      audio: { codec: 'aac', channels: 2 },
      audioTracks: [],
    } as unknown as MediaItem;
    expect(audioTracksOf(legacy)).toEqual([{ codec: 'aac', channels: 2, index: 0 }]);
  });

  it('is empty for an item with no audio at all', () => {
    expect(audioTracksOf(UNPROBED)).toEqual([]);
  });
});

describe('canSeamlessAudioSwitch', () => {
  it('is off when the video itself cannot direct-play', () => {
    const av1 = makeItem({ videoCodec: 'av1', audio: [EN_51(0), FR_51(1)] });
    expect(canSeamlessAudioSwitch(av1, SAFARI_CAPS)).toBe(false);
  });

  it('needs a second track to be worth anything', () => {
    expect(canSeamlessAudioSwitch(makeItem({ audio: [EN_51(0)] }), MSE_CAPS)).toBe(false);
    expect(canSeamlessAudioSwitch(makeItem({ audio: [EN_51(0), FR_51(1)] }), MSE_CAPS)).toBe(true);
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

describe('nativeDirectPlayable', () => {
  it('opens the QuickTime family on both, but Matroska only on Media3', () => {
    const mkv = makeItem({
      container: 'mkv',
      videoCodec: 'hevc',
      audio: [track({ index: 0, codec: 'dts', channels: 6 })],
    });
    expect(nativeDirectPlayable(mkv, 'ios')).toBe(false);
    expect(nativeDirectPlayable(mkv, 'android')).toBe(true);
    const mp4 = makeItem({ container: 'MP4', videoCodec: 'h264', audio: [] });
    expect(nativeDirectPlayable(mp4, 'ios')).toBe(true);
    expect(nativeDirectPlayable(mp4, 'android')).toBe(true);
  });

  it('refuses AV1 on either, whatever the container', () => {
    const av1 = makeItem({ container: 'mp4', videoCodec: 'av1', audio: [] });
    expect(nativeDirectPlayable(av1, 'ios')).toBe(false);
    expect(nativeDirectPlayable(av1, 'android')).toBe(false);
  });

  it('refuses an item whose container was never probed', () => {
    expect(nativeDirectPlayable(UNPROBED, 'ios')).toBe(false);
    expect(nativeDirectPlayable(UNPROBED, 'android')).toBe(false);
    expect(avplayDirectPlayable(UNPROBED)).toBe(false);
  });
});

describe('resolveAudioRelativeIndex', () => {
  it('resolves the commentary id even when the list is reordered', () => {
    const reordered: AudioTrack[] = [FR_51(1), EN_51(0), FR_COMMENTARY(2)];
    const want = audioTrackId(FR_COMMENTARY(2));
    expect(resolveAudioRelativeIndex(reordered, want)).toBe(2);
  });

  it('disambiguates same-language tracks by channel count', () => {
    const tracks: AudioTrack[] = [
      track({ index: 0, language: 'fr', channels: 6 }),
      track({ index: 1, language: 'fr', channels: 2 }),
    ];
    const want = { index: 5, language: 'fr', title: null, channels: 2 };
    expect(resolveAudioRelativeIndex(tracks, want)).toBe(1);
  });

  it('matches by language + channels when the wanted title is missing', () => {
    const tracks: AudioTrack[] = [
      track({ index: 3, language: 'en', channels: 6 }),
      track({ index: 4, language: 'fr', channels: 6 }),
    ];
    const want = { index: 9, language: 'en', title: null, channels: 6 };
    expect(resolveAudioRelativeIndex(tracks, want)).toBe(3);
  });

  it('returns the matching index when index and identity agree', () => {
    const tracks: AudioTrack[] = [EN_51(0), FR_51(1)];
    expect(resolveAudioRelativeIndex(tracks, audioTrackId(FR_51(1)))).toBe(1);
  });

  it('ignores a disagreeing index and resolves by identity', () => {
    const tracks: AudioTrack[] = [EN_51(0), FR_51(1)];
    const want = { index: 0, language: 'fr', title: null, channels: 6 };
    expect(resolveAudioRelativeIndex(tracks, want)).toBe(1);
  });

  it('falls back to the default track when nothing matches', () => {
    const tracks: AudioTrack[] = [
      track({ index: 0, language: 'en', channels: 6 }),
      track({ index: 1, language: 'de', channels: 6, default: true }),
    ];
    const want = { index: 9, language: 'ja', title: null, channels: 2 };
    expect(resolveAudioRelativeIndex(tracks, want)).toBe(1);
  });

  it('falls back to the first track when nothing matches and there is no default', () => {
    const tracks: AudioTrack[] = [
      track({ index: 0, language: 'en', channels: 6 }),
      track({ index: 1, language: 'de', channels: 6 }),
    ];
    const want = { index: 9, language: 'ja', title: null, channels: 2 };
    expect(resolveAudioRelativeIndex(tracks, want)).toBe(0);
  });

  it('returns 0 for an empty track list', () => {
    expect(
      resolveAudioRelativeIndex([], { index: 0, language: null, title: null, channels: null }),
    ).toBe(0);
  });

  it('reads an untagged track as an all-null identity', () => {
    const untagged = { index: 3, codec: 'aac', default: false } as unknown as AudioTrack;
    expect(audioTrackId(untagged)).toEqual({
      index: 3,
      language: null,
      title: null,
      channels: null,
    });
  });

  it('matches an untagged track on its index alone', () => {
    const tracks: AudioTrack[] = [track({ index: 0 }), track({ index: 1 })];
    const want = { index: 1, language: null, title: null, channels: null };
    expect(resolveAudioRelativeIndex(tracks, want)).toBe(1);
  });

  it('prefers the untagged track when the wanted identity is untagged too', () => {
    const tracks: AudioTrack[] = [
      track({ index: 0, language: 'en', channels: 6 }),
      track({ index: 1 }),
    ];
    const want = { index: 9, language: null, title: null, channels: null };
    expect(resolveAudioRelativeIndex(tracks, want)).toBe(1);
  });

  it('lets the title break a tie between two same-language, same-layout tracks', () => {
    const tracks: AudioTrack[] = [
      track({ index: 4, language: 'fr', title: 'Version française', channels: 2 }),
      track({ index: 5, language: 'fr', title: 'Commentaire', channels: 2 }),
    ];
    const want = { index: 9, language: 'fr', title: '  commentaire ', channels: 2 };
    expect(resolveAudioRelativeIndex(tracks, want)).toBe(5);
  });
});

const WEB_CHROME: PlayEnv = { platform: 'web', safari: false };
const WEB_SAFARI: PlayEnv = { platform: 'web', safari: true };
const TIZEN: PlayEnv = { platform: 'tizen', safari: false };
const WEBOS: PlayEnv = { platform: 'webos', safari: false };
const DESKTOP: PlayEnv = { platform: 'desktop', safari: false };

describe('selectEngine', () => {
  it('routes a plain h264 + aac single-audio mp4 to direct-play on Chrome', () => {
    const item = makeItem({
      container: 'mp4',
      videoCodec: 'h264',
      audio: [track({ index: 0, codec: 'aac', channels: 2, default: true })],
    });
    expect(selectEngine(item, WEB_CHROME)).toEqual({ kind: 'direct', aacMaster: false });
  });

  it('routes an MKV to web-mse (not direct) on Chrome', () => {
    const item = makeItem({
      container: 'mkv',
      videoCodec: 'h264',
      audio: [track({ index: 0, codec: 'aac', channels: 6, default: true })],
    });
    expect(selectEngine(item, WEB_CHROME).kind).toBe('web-mse');
  });

  it('direct-plays an HEVC mp4 on Chrome when the engine caps decode HEVC', () => {
    const item = makeItem({
      container: 'mp4',
      videoCodec: 'hevc',
      audio: [track({ index: 0, codec: 'aac', channels: 2, default: true })],
    });
    expect(selectEngine(item, WEB_CHROME)).toEqual({ kind: 'direct', aacMaster: false });
  });

  it('keeps HEVC off direct-play when the runtime probes NO HEVC decode', () => {
    const item = makeItem({
      container: 'mp4',
      videoCodec: 'hevc',
      audio: [track({ index: 0, codec: 'aac', channels: 2, default: true })],
    });
    const noHevc: PlayEnv = {
      platform: 'web',
      safari: false,
      runtimeCaps: { ...MSE_CAPS, hevc: false, hevc10bit: false },
    };
    expect(selectEngine(item, noHevc)).toEqual({ kind: 'web-mse', aacMaster: false });
  });

  it('avplayDirectPlayable: HEVC+DTS MKV yes, AV1 no, unknown container no', () => {
    const mkv = makeItem({
      container: 'mkv',
      videoCodec: 'hevc',
      audio: [track({ index: 0, codec: 'dts', channels: 6, default: true })],
    });
    expect(avplayDirectPlayable(mkv)).toBe(true);
    const av1 = makeItem({
      container: 'mkv',
      videoCodec: 'av1',
      audio: [track({ index: 0, codec: 'aac', channels: 2, default: true })],
    });
    expect(avplayDirectPlayable(av1)).toBe(false);
    const iso = makeItem({
      container: 'iso',
      videoCodec: 'h264',
      audio: [track({ index: 0, codec: 'aac', channels: 2, default: true })],
    });
    expect(avplayDirectPlayable(iso)).toBe(false);
  });

  it('direct-plays HEVC + aac mp4 on Safari (native HEVC decode)', () => {
    const item = makeItem({
      container: 'mp4',
      videoCodec: 'hevc',
      audio: [track({ index: 0, codec: 'aac', channels: 2, default: true })],
    });
    expect(selectEngine(item, WEB_SAFARI)).toEqual({ kind: 'direct', aacMaster: false });
  });

  it('Safari cannot decode AV1 (no software decoder; HW is M3+ only)', () => {
    const av1 = makeItem({
      container: 'mkv',
      videoCodec: 'av1',
      audio: [track({ index: 0, codec: 'aac', channels: 2, default: true })],
    });
    expect(canDirectPlay(av1, MSE_CAPS).canDirectPlay).toBe(true);
    const verdict = canDirectPlay(av1, SAFARI_CAPS);
    expect(verdict.canDirectPlay).toBe(false);
    expect(verdict.messageKey).toBe('player.av1Unsupported');
  });

  it('HEVC + EAC3 (2 audio): tizen native (no aac), web-mse + aac, webos + aac', () => {
    const item = makeItem({
      container: 'mp4',
      videoCodec: 'hevc',
      audio: [
        track({ index: 0, codec: 'eac3', language: 'en', channels: 6, default: true }),
        track({ index: 1, codec: 'eac3', language: 'fr', channels: 6 }),
      ],
    });
    expect(selectEngine(item, TIZEN)).toEqual({ kind: 'tizen-avplay', aacMaster: false });
    expect(selectEngine(item, WEB_CHROME)).toEqual({ kind: 'web-mse', aacMaster: true });
    expect(selectEngine(item, WEBOS)).toEqual({ kind: 'webos', aacMaster: true });
    expect(selectEngine(item, DESKTOP)).toEqual({ kind: 'desktop-mpv', aacMaster: false });
  });

  it('legacy webOS (nativeHls): the master is handed to the native pipeline, stream-copied', () => {
    const item = makeItem({
      container: 'mkv',
      videoCodec: 'hevc',
      audio: [
        track({ index: 0, codec: 'eac3', language: 'en', channels: 6, default: true }),
        track({ index: 1, codec: 'eac3', language: 'fr', channels: 6 }),
      ],
    });
    // Chromium < 99 can't decode HEVC via MSE, but the TV pipeline decodes the
    // HLS master (surround included) itself, so no AAC transcode.
    expect(selectEngine(item, { ...WEBOS, nativeHls: true })).toEqual({
      kind: 'webos',
      aacMaster: false,
    });
  });

  it('always routes the Steam Deck to desktop-mpv (even a plain mp4)', () => {
    const item = makeItem({
      container: 'mp4',
      videoCodec: 'h264',
      audio: [track({ index: 0, codec: 'aac', channels: 2, default: true })],
    });
    expect(selectEngine(item, DESKTOP)).toEqual({ kind: 'desktop-mpv', aacMaster: false });
  });

  it('direct-plays a single-audio mp4 even when no track is flagged default', () => {
    const item = makeItem({
      container: 'mp4',
      videoCodec: 'h264',
      audio: [track({ index: 0, codec: 'aac', channels: 2 })],
    });
    expect(selectEngine(item, WEB_CHROME)).toEqual({ kind: 'direct', aacMaster: false });
  });

  it('routes an item with no probed container to the MSE master', () => {
    expect(selectEngine(UNPROBED, WEB_CHROME)).toEqual({ kind: 'web-mse', aacMaster: true });
  });

  it('direct-plays a plain mp4 on webOS, but always reports tizen-avplay on Tizen', () => {
    const item = makeItem({
      container: 'mp4',
      videoCodec: 'h264',
      audio: [track({ index: 0, codec: 'aac', channels: 2, default: true })],
    });
    expect(selectEngine(item, WEBOS)).toEqual({ kind: 'direct', aacMaster: false });
    expect(selectEngine(item, TIZEN)).toEqual({ kind: 'tizen-avplay', aacMaster: false });
  });
});

describe('masterNeedsAac', () => {
  it('keeps an all-aac master as stream-copy on every engine', () => {
    const item = makeItem({ audio: [track({ index: 0, codec: 'aac', channels: 2 })] });
    expect(masterNeedsAac(item, MSE_CAPS)).toBe(false);
    expect(masterNeedsAac(item, SAFARI_CAPS)).toBe(false);
    expect(masterNeedsAac(item, NATIVE_TV_CAPS)).toBe(false);
  });

  it('forces AAC for EAC3 under MSE but stream-copies on Safari / native TV', () => {
    const item = makeItem({ audio: [track({ index: 0, codec: 'eac3', channels: 6 })] });
    expect(masterNeedsAac(item, MSE_CAPS)).toBe(true);
    expect(masterNeedsAac(item, SAFARI_CAPS)).toBe(false);
    expect(masterNeedsAac(item, NATIVE_TV_CAPS)).toBe(false);
  });

  it('forces AAC for DTS everywhere (never fMP4-copy-safe)', () => {
    const item = makeItem({ audio: [track({ index: 0, codec: 'dts', channels: 6 })] });
    expect(masterNeedsAac(item, MSE_CAPS)).toBe(true);
    expect(masterNeedsAac(item, SAFARI_CAPS)).toBe(true);
    expect(masterNeedsAac(item, NATIVE_TV_CAPS)).toBe(true);
  });

  it('forces AAC when any track is undecodable under the engine', () => {
    const item = makeItem({
      audio: [
        track({ index: 0, codec: 'aac', channels: 2 }),
        track({ index: 1, codec: 'eac3', channels: 6 }),
      ],
    });
    expect(masterNeedsAac(item, MSE_CAPS)).toBe(true);
    expect(masterNeedsAac(item, SAFARI_CAPS)).toBe(false);
  });

  it('forces AAC when the audio is unknown (unprobed file, no track list)', () => {
    const item = makeItem({ audio: [] });
    expect(masterNeedsAac(item, MSE_CAPS)).toBe(true);
    expect(masterNeedsAac(item, SAFARI_CAPS)).toBe(true);
    expect(masterNeedsAac(item, NATIVE_TV_CAPS)).toBe(true);
  });
});
