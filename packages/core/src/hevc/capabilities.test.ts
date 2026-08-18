import { afterEach, describe, expect, it, vi } from 'vitest';

const rn = vi.hoisted(() => ({ os: 'web' as 'ios' | 'android' | 'web' }));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return rn.os;
    },
  },
}));

import {
  type AudioCapabilities,
  capabilities,
  decodableAudioCodecs,
  decodableVideoCodecs,
  detectCapabilities,
  type PlaybackCapabilities,
} from './capabilities';

type G = Record<string, unknown>;
const g = globalThis as unknown as G;

afterEach(() => {
  for (const k of ['tizen', 'webOS', 'MediaSource', 'matchMedia', 'document']) {
    delete g[k];
  }
});

function asReactNative<T>(os: 'ios' | 'android', fn: () => T): T {
  const real = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { product: 'ReactNative', userAgent: '' },
    configurable: true,
  });
  rn.os = os;
  try {
    return fn();
  } finally {
    rn.os = 'web';
    if (real) Object.defineProperty(globalThis, 'navigator', real);
  }
}

const NO_AUDIO: AudioCapabilities = {
  aac: false,
  ac3: false,
  eac3: false,
  dts: false,
  truehd: false,
  flac: false,
  opus: false,
  mp3: false,
  vorbis: false,
};

const ALL_AUDIO: AudioCapabilities = {
  aac: true,
  ac3: true,
  eac3: true,
  dts: true,
  truehd: true,
  flac: true,
  opus: true,
  mp3: true,
  vorbis: true,
};

const FFPROBE_NAMES = ['aac', 'ac3', 'eac3', 'dts', 'truehd', 'flac', 'opus', 'mp3', 'vorbis'];

const caps = (audio: Partial<AudioCapabilities>): PlaybackCapabilities => ({
  hevc: false,
  hevc10bit: false,
  h264: false,
  av1: false,
  vp9: false,
  hdr: false,
  audio: { ...NO_AUDIO, ...audio },
  source: 'unknown',
});

const videoCaps = (video: Partial<PlaybackCapabilities>): PlaybackCapabilities => ({
  ...caps({}),
  ...video,
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

  it('probes a runtime that has no navigator to read a user agent from', () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });
    try {
      expect(detectCapabilities().source).toBe('videoElement');
    } finally {
      if (real) Object.defineProperty(globalThis, 'navigator', real);
    }
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

describe('detectCapabilities (React Native)', () => {
  it('withholds DTS and TrueHD from Apple, which AVPlayer cannot decode', () => {
    const audio = asReactNative('ios', () => detectCapabilities().audio);
    expect(audio).toEqual({
      aac: true,
      ac3: true,
      eac3: true,
      dts: false,
      truehd: false,
      flac: true,
      opus: true,
      mp3: true,
      vorbis: true,
    });
  });

  it('keeps DTS and TrueHD on Android, which bundles the ffmpeg decoders', () => {
    const audio = asReactNative('android', () => detectCapabilities().audio);
    expect(audio).toEqual({
      aac: true,
      ac3: true,
      eac3: true,
      dts: true,
      truehd: true,
      flac: true,
      opus: true,
      mp3: true,
      vorbis: true,
    });
  });

  it('reports platform-tv on both, since neither probes a video element', () => {
    expect(asReactNative('ios', () => detectCapabilities().source)).toBe('platform-tv');
    expect(asReactNative('android', () => detectCapabilities().source)).toBe('platform-tv');
  });

  it('leaves the TV browsers alone: Tizen still claims every codec', () => {
    g.tizen = {};
    expect(detectCapabilities().audio).toMatchObject({ dts: true, truehd: true });
  });
});

describe('decodableAudioCodecs', () => {
  it('names only the codecs the set marks decodable', () => {
    expect(decodableAudioCodecs(caps({ aac: true, eac3: true, mp3: true }))).toEqual([
      'aac',
      'eac3',
      'mp3',
    ]);
  });

  it('names nothing when the device decodes nothing', () => {
    expect(decodableAudioCodecs(caps({}))).toEqual([]);
  });

  it('spells every codec the way ffprobe does, so the server matches it', () => {
    expect(decodableAudioCodecs(caps(ALL_AUDIO))).toEqual(FFPROBE_NAMES);
  });

  it('emits names the server can split on a comma and compare verbatim', () => {
    for (const codec of decodableAudioCodecs(caps(ALL_AUDIO))) {
      expect(codec).toBe(codec.trim().toLowerCase());
      expect(codec).not.toContain(',');
    }
  });

  it('falls back to the cached capabilities of this runtime', () => {
    expect(decodableAudioCodecs()).toEqual([]);
  });

  it('names what an Apple runtime can actually decode', () => {
    const list = asReactNative('ios', () => decodableAudioCodecs(detectCapabilities()));
    expect(list).not.toContain('dts');
    expect(list).not.toContain('truehd');
    expect(list).toContain('eac3');
  });
});

describe('decodableVideoCodecs', () => {
  it('names only the codecs the set marks decodable', () => {
    expect(decodableVideoCodecs(videoCaps({ h264: true, vp9: true }))).toEqual(['h264', 'vp9']);
  });

  it('names nothing when the device decodes nothing', () => {
    expect(decodableVideoCodecs(videoCaps({}))).toEqual([]);
  });

  it('spells every codec the way ffprobe does, so the server matches it', () => {
    const all = videoCaps({ hevc: true, hevc10bit: true, h264: true, av1: true, vp9: true });
    expect(decodableVideoCodecs(all)).toEqual(['hevc', 'h264', 'av1', 'vp9']);
  });

  it('emits names the server can split on a comma and compare verbatim', () => {
    const all = videoCaps({ hevc: true, h264: true, av1: true, vp9: true });
    for (const codec of decodableVideoCodecs(all)) {
      expect(codec).toBe(codec.trim().toLowerCase());
      expect(codec).not.toContain(',');
    }
  });

  it('never names the flags that are not codecs', () => {
    const all = videoCaps({
      hevc: true,
      hevc10bit: true,
      h264: true,
      av1: true,
      vp9: true,
      hdr: true,
    });
    expect(decodableVideoCodecs(all)).not.toContain('hevc10bit');
    expect(decodableVideoCodecs(all)).not.toContain('hdr');
  });

  it('still names hevc when only the 10-bit profile is out of reach', () => {
    expect(decodableVideoCodecs(videoCaps({ hevc: true, hevc10bit: false }))).toEqual(['hevc']);
    const forTenBit = videoCaps({ hevc: true, hevc10bit: false, h264: true });
    expect(decodableVideoCodecs({ ...forTenBit, hevc: false })).toEqual(['h264']);
  });

  it('falls back to the cached capabilities of this runtime', () => {
    expect(decodableVideoCodecs()).toEqual([]);
  });

  it('names what a TV runtime can actually decode', () => {
    g.tizen = {};
    expect(decodableVideoCodecs(detectCapabilities())).toEqual(['hevc', 'h264', 'vp9']);
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

  it('accepts the video-dynamic-range spelling a TV browser answers instead', () => {
    g.matchMedia = (q: string) => ({ matches: q.includes('video-dynamic-range: high') });
    expect(detectCapabilities().hdr).toBe(true);
  });

  it('reports no HDR when neither query matches', () => {
    g.matchMedia = () => ({ matches: false });
    expect(detectCapabilities().hdr).toBe(false);
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
