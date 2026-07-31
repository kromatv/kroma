// @vitest-environment jsdom

import type { AudioTrack, MediaItem, PlayEnv } from '@kroma/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { planEngine } from './backend.web';

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

function makeItem(p: { container?: string; videoCodec?: string; audio?: AudioTrack[] }): MediaItem {
  const audio = p.audio ?? [track({ index: 0, codec: 'aac', channels: 2, default: true })];
  return {
    container: p.container ?? 'mp4',
    video: { codec: p.videoCodec ?? 'h264', bitDepth: 8 },
    audio: audio[0] ?? null,
    audioTracks: audio,
    durationMs: 1000,
  } as unknown as MediaItem;
}

const env = (over: Partial<PlayEnv> = {}): PlayEnv => ({ platform: 'web', safari: false, ...over });

const PLAIN_MP4 = makeItem({ container: 'mp4', videoCodec: 'h264' });
const MKV = makeItem({ container: 'mkv', videoCodec: 'hevc' });

// jsdom's <video> answers '' to every canPlayType, which would read as "this
// webview demuxes nothing"; real browsers answer 'probably' for MP4.
function webviewPlays(types: Record<string, string>) {
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
    (type: string) => (types[type] ?? '') as '' | 'maybe' | 'probably',
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('planEngine', () => {
  it('direct-plays a plain MP4 in a browser', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    const plan = planEngine(PLAIN_MP4, env(), 'auto');
    expect(plan.eng).toBe('video-direct');
    expect(plan.surface).toBe('video');
    expect(plan.playbackMode).toBe('direct');
  });

  it('sends an MKV to the server remux, because no webview demuxes Matroska', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    const plan = planEngine(MKV, env(), 'auto');
    expect(plan.eng).toBe('video-remux');
    expect(plan.playbackMode).not.toBe('direct');
  });

  // A forced direct-play on a container the webview cannot demux does not fail,
  // it hangs at HAVE_NOTHING with no error.
  it('overrides a forced direct-play when the webview cannot demux the container', () => {
    webviewPlays({}); // demuxes nothing
    expect(planEngine(PLAIN_MP4, env(), 'webview').eng).toBe('video-remux');
  });

  it('honours an explicit remux preference over a direct-playable file', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    expect(planEngine(PLAIN_MP4, env(), 'remux').eng).toBe('video-remux');
  });

  it('drives the master through Shaka by default; only the remux pref keeps hls.js', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    expect(planEngine(MKV, env(), 'auto').masterShaka).toBe(true);
    expect(planEngine(MKV, env(), 'remux').masterShaka).toBe(false);
  });

  it('the shaka preference forces the master even for a direct-playable file', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    const plan = planEngine(PLAIN_MP4, env(), 'shaka');
    expect(plan.eng).toBe('video-remux');
    expect(plan.masterShaka).toBe(true);
  });

  describe('on Samsung Tizen', () => {
    function tizen() {
      vi.stubGlobal('webapis', { avplay: { play: () => {} } });
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (SMART-TV; Tizen 6.0)' });
    }

    it('takes the AVPlay plane by default, for hardware surround', () => {
      tizen();
      const plan = planEngine(PLAIN_MP4, env({ platform: 'tizen' }), 'auto');
      expect(plan.eng).toBe('avplay');
      expect(plan.surface).toBe('avplay');
      expect(plan.deviceLabel).toBe('Samsung TV');
    });

    it('lets the viewer force the server remux instead', () => {
      tizen();
      webviewPlays({ 'video/mp4': 'probably' });
      expect(planEngine(PLAIN_MP4, env({ platform: 'tizen' }), 'remux').eng).toBe('video-remux');
    });

    // Tizen offers auto / avplay / remux; `webview` is a webOS and desktop engine.
    it('degrades an engine Tizen does not offer to the automatic choice', () => {
      tizen();
      webviewPlays({ 'video/mp4': 'probably' });
      expect(planEngine(PLAIN_MP4, env({ platform: 'tizen' }), 'webview').eng).toBe('avplay');
    });

    it('reports direct only when AVPlay can open the original file', () => {
      tizen();
      const plan = planEngine(MKV, env({ platform: 'tizen' }), 'auto');
      expect(plan.useAvplay).toBe(true);
      expect(plan.playbackMode).toBe(plan.avplayDirect ? 'direct' : 'remux');
    });
  });

  it('names an LG set from its user agent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Web0S; Linux/SmartTV)' });
    webviewPlays({ 'video/mp4': 'probably' });
    expect(planEngine(PLAIN_MP4, env({ platform: 'webos' }), 'auto').deviceLabel).toBe('LG TV');
  });

  it('ignores a stored engine this platform does not offer', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (SMART-TV; Tizen 6.0)' });
    vi.stubGlobal('webapis', { avplay: { play: () => {} } });
    expect(planEngine(PLAIN_MP4, env({ platform: 'tizen' }), 'mpv').eng).toBe('avplay');
  });

  it('changes rebuildKey only when a decision changes', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    const a = planEngine(PLAIN_MP4, env(), 'auto');
    const b = planEngine(PLAIN_MP4, env(), 'auto');
    const remuxed = planEngine(PLAIN_MP4, env(), 'remux');
    expect(a.rebuildKey).toBe(b.rebuildKey);
    expect(a.rebuildKey).not.toBe(remuxed.rebuildKey);
  });
});
