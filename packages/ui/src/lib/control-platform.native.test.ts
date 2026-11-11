import { afterEach, describe, expect, it, vi } from 'vitest';

async function pointerOn(os: string, isTV: boolean): Promise<{ has: boolean; less: boolean }> {
  vi.resetModules();
  vi.doMock('react-native', () => ({
    Animated: { View: 'View' },
    Platform: { OS: os, isTV },
    View: 'View',
  }));
  vi.doMock('./focus-transition', () => ({ usePressScale: vi.fn() }));
  vi.doMock('./platform', () => ({ WEB: false }));
  vi.doMock('./press-dip', () => ({ useFlatPress: vi.fn() }));
  const { POINTERLESS, TV_HAS_POINTER } = await import('./control-platform');
  return { has: TV_HAS_POINTER, less: POINTERLESS };
}

afterEach(() => {
  vi.doUnmock('react-native');
  vi.doUnmock('./focus-transition');
  vi.doUnmock('./platform');
  vi.doUnmock('./press-dip');
});

describe('a television whose remote points', () => {
  it('is an LG set, with its Magic Remote', async () => {
    expect(await pointerOn('webos', true)).toEqual({ has: true, less: false });
  });

  it('is an Android TV box, with an air mouse', async () => {
    expect(await pointerOn('android', true)).toEqual({ has: true, less: false });
  });

  it('is neither an Apple TV nor a Samsung set', async () => {
    expect(await pointerOn('ios', true)).toEqual({ has: false, less: true });
    expect(await pointerOn('tizen', true)).toEqual({ has: false, less: true });
  });

  it('is never a phone, which is touched', async () => {
    expect(await pointerOn('android', false)).toEqual({ has: false, less: false });
  });
});
