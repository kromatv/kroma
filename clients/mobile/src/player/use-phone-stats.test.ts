// @vitest-environment jsdom

import type { MediaItem } from '@kromatv/client/media';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Engine } from './engine';

vi.mock('@kromatv/ui', () => ({
  audioFilterLabels: () => ({ off: 'Off', standard: 'Standard', night: 'Night' }),
  buildLeanStats: (stats: unknown) => stats,
}));
vi.mock('#mobile/lib/i18n', () => ({ useT: () => (key: string) => key }));

import { usePhoneStats } from './use-phone-stats';

const item = {
  durationMs: 100000,
  defaultFileId: 'preferred',
  files: [
    { id: 'other', size: 100000 },
    { id: 'preferred', size: 1000000 },
  ],
  audioTracks: [{ index: 0, codec: 'aac', language: 'en' }],
} as unknown as MediaItem;

function engine(overrides: Partial<Engine> = {}): Engine {
  return {
    offline: false,
    mode: 'master',
    buffered: 0,
    cur: 0,
    dur: 100,
    audioIndex: 0,
    filter: 'off',
    rate: 1,
    ...overrides,
  } as Engine;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('phone playback statistics', () => {
  it('estimates bandwidth from the preferred file, smooths it, and clamps seek jumps', () => {
    const playback = engine();
    const { result } = renderHook(() => usePhoneStats(playback, item));
    expect(result.current()).toMatchObject({ mode: 'HLS', meters: [{ value: 0 }] });
    vi.setSystemTime(2000);
    playback.buffered = 10;
    expect(result.current()).toMatchObject({ meters: [{ value: 0.8, display: '0.80 Mb/s' }] });
    vi.setSystemTime(2100);
    expect(result.current()).toMatchObject({ meters: [{ value: 0.8 }] });
    vi.setSystemTime(3000);
    playback.buffered = 600;
    expect(result.current()).toMatchObject({ meters: [{ value: 2.08 }] });
    vi.setSystemTime(4000);
    playback.buffered = 0;
    expect(result.current()).toMatchObject({ meters: [{ value: 1.248 }] });
  });

  it('describes local playback without network meters or server audio filters', () => {
    const { result } = renderHook(() => usePhoneStats(engine({ offline: true, rate: 1.5 }), item));
    expect(result.current()).toMatchObject({
      mode: 'Direct · local',
      audioTracks: [],
      meters: undefined,
      extra: [{ value: '1.5×' }],
    });
  });

  it('omits bandwidth without file metadata and includes the current server filter', () => {
    const incomplete = { ...item, files: [], durationMs: null };
    const { result } = renderHook(() =>
      usePhoneStats(engine({ mode: 'direct', filter: 'night' }), incomplete),
    );
    expect(result.current()).toMatchObject({
      mode: 'Direct',
      meters: undefined,
      extra: [{ value: 'player.normalSpeed' }, { value: 'Night' }],
    });
  });

  it('uses the first file when the preferred file is missing', () => {
    const playback = engine();
    const { result } = renderHook(() => usePhoneStats(playback, { ...item, defaultFileId: null }));
    result.current();
    vi.setSystemTime(2000);
    playback.buffered = 10;
    expect(result.current()).toMatchObject({ meters: [{ value: 0.08 }] });
  });
});
