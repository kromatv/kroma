import { afterEach, describe, expect, it, vi } from 'vitest';

const prefetch = vi.fn();
vi.mock('react-native', () => ({ Image: { prefetch: (url: string) => prefetch(url) } }));

const { prefetchImage } = await import('./prefetch-image');

afterEach(() => {
  prefetch.mockReset();
});

describe('prefetchImage (native)', () => {
  it('resolves what the native cache reports', async () => {
    prefetch.mockResolvedValue(true);

    expect(await prefetchImage('https://x/a.webp')).toBe(true);
    expect(prefetch).toHaveBeenCalledWith('https://x/a.webp');
  });

  it('resolves false when the native prefetch fails', async () => {
    prefetch.mockRejectedValue(new Error('offline'));

    expect(await prefetchImage('https://x/b.webp')).toBe(false);
  });
});
