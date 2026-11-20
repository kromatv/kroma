// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { tvReach } from './tv-reach';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('what a television gave this browser', () => {
  it('is kept by the television address and given back', async () => {
    await tvReach.keys?.set('192.168.1.40', 'k-1');

    await expect(tvReach.keys?.get('192.168.1.40')).resolves.toBe('k-1');
    await expect(tvReach.keys?.get('192.168.1.41')).resolves.toBeNull();
  });

  it('is nothing in a browser that refuses storage', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    await expect(tvReach.keys?.set('192.168.1.40', 'k-1')).resolves.toBeUndefined();
    await expect(tvReach.keys?.get('192.168.1.40')).resolves.toBeNull();
  });
});
