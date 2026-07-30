import { afterEach, describe, expect, it } from 'vitest';
import { capabilities, detectCapabilities } from './capabilities';

type G = Record<string, unknown>;
const g = globalThis as unknown as G;

afterEach(() => {
  for (const k of ['tizen', 'webOS', 'MediaSource', 'matchMedia', 'document']) {
    delete g[k];
  }
});

describe('detectCapabilities (node baseline: no DOM, no MediaSource)', () => {
  it('reports nothing decodable and a bare-video-element source', () => {
    const caps = detectCapabilities();
    expect(caps.hevc).toBe(false);
    expect(caps.hevc10bit).toBe(false);
    expect(caps.h264).toBe(false);
    expect(caps.av1).toBe(false);
    expect(caps.hdr).toBe(false);
    expect(caps.source).toBe('videoElement');
    expect(caps.audio.aac).toBe(false);
    expect(caps.audio.dts).toBe(false);
  });
});

describe('detectCapabilities (TV platforms)', () => {
  it('treats Tizen as fully hardware-capable (platform-tv)', () => {
    g.tizen = {};
    const caps = detectCapabilities();
    expect(caps.source).toBe('platform-tv');
    expect(caps).toMatchObject({
      hevc: true,
      hevc10bit: true,
      h264: true,
      av1: false,
      vp9: true,
      hdr: true,
    });
    expect(caps.audio).toMatchObject({ aac: true, ac3: true, eac3: true, dts: true, truehd: true });
  });

  it('treats webOS as platform-tv', () => {
    g.webOS = {};
    expect(detectCapabilities().source).toBe('platform-tv');
  });
});

describe('detectCapabilities (browser detection paths)', () => {
  it('detects codecs via MediaSource.isTypeSupported and reports a mediaSource source', () => {
    g.MediaSource = { isTypeSupported: (t: string) => t.includes('hvc1') || t.includes('mp4a') };
    const caps = detectCapabilities();
    expect(caps.hevc).toBe(true);
    expect(caps.source).toBe('mediaSource');
    expect(caps.audio.aac).toBe(true);
    expect(caps.audio.ac3).toBe(false); // ac-3 not advertised by the stub
  });

  it('falls back to a <video> element canPlayType when there is no MediaSource', () => {
    g.document = {
      createElement: () => ({ canPlayType: (t: string) => (t.includes('avc1') ? 'probably' : '') }),
    };
    const caps = detectCapabilities();
    expect(caps.h264).toBe(true);
    expect(caps.hevc).toBe(false);
    expect(caps.source).toBe('videoElement');
  });

  it('detects HDR through matchMedia', () => {
    g.matchMedia = (q: string) => ({ matches: q.includes('dynamic-range: high') });
    expect(detectCapabilities().hdr).toBe(true);
  });
});

describe('capabilities (cached)', () => {
  it('memoizes the first detection and ignores later global changes', () => {
    const first = capabilities();
    expect(capabilities()).toBe(first);
    g.tizen = {};
    expect(capabilities()).toBe(first);
    expect(capabilities().source).toBe('videoElement');
  });
});
