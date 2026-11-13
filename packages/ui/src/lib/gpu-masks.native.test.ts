import { afterEach, describe, expect, it, vi } from 'vitest';

async function masksOn(os: string): Promise<boolean> {
  vi.resetModules();
  vi.doMock('react-native', () => ({ Platform: { OS: os } }));
  const { GPU_MASKS } = await import('./gpu-masks');
  return GPU_MASKS;
}

async function pageMasksOn(os: string): Promise<boolean> {
  vi.resetModules();
  vi.doMock('react-native', () => ({ Platform: { OS: os } }));
  const { PAGE_MASKS } = await import('./gpu-masks');
  return PAGE_MASKS;
}

afterEach(() => {
  vi.doUnmock('react-native');
});

describe('GPU_MASKS', () => {
  it('masks on Apple TV, which draws a mask on the GPU', async () => {
    expect(await masksOn('ios')).toBe(true);
  });

  it('masks on Tizen, whose host draws a mask on the GPU', async () => {
    expect(await masksOn('tizen')).toBe(true);
  });

  it('masks on webOS, whose host draws a mask on the GPU', async () => {
    expect(await masksOn('webos')).toBe(true);
  });

  it('leaves Android unmasked, where a mask redraws the page through a bitmap', async () => {
    expect(await masksOn('android')).toBe(false);
  });
});

describe('PAGE_MASKS', () => {
  it('masks a whole page on Apple TV and webOS', async () => {
    expect(await pageMasksOn('ios')).toBe(true);
    expect(await pageMasksOn('webos')).toBe(true);
  });

  it('keeps a page-sized mask off Tizen, where every rounded clip under it is redrawn each frame', async () => {
    expect(await pageMasksOn('tizen')).toBe(false);
  });

  it('masks no page where nothing is masked at all', async () => {
    expect(await pageMasksOn('android')).toBe(false);
  });
});
