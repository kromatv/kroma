import { describe, expect, it } from 'vitest';
import { canDirectPlay, MSE_CAPS, SAFARI_CAPS } from './directplay';
import { makeItem, track, UNPROBED } from './directplay.fixture';
import { avplayDirectPlayable, nativeDirectPlayable, type PlayEnv, selectEngine } from './engine';

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
