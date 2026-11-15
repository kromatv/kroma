import { afterEach, describe, expect, it, vi } from 'vitest';

type Measured = (width: number, height: number) => void;

const getSize = vi.fn();
vi.mock('react-native', () => ({
  Image: {
    getSize: (uri: string, done: Measured, failed: () => void) => getSize(uri, done, failed),
  },
}));

const { imageSize } = await import('./image-size');

afterEach(() => {
  getSize.mockReset();
});

describe('imageSize (native)', () => {
  it('resolves what the native decoder measures', async () => {
    getSize.mockImplementation((_uri: string, done: Measured) => done(640, 360));

    expect(await imageSize('file:///a.jpg')).toEqual({ width: 640, height: 360 });
    expect(getSize.mock.calls[0]?.[0]).toBe('file:///a.jpg');
  });

  it('resolves null when the picture cannot be read', async () => {
    getSize.mockImplementation((_uri: string, _done: Measured, failed: () => void) => failed());

    expect(await imageSize('file:///b.jpg')).toBeNull();
  });
});
