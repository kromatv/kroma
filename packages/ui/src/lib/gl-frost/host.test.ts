import { describe, expect, it, vi } from 'vitest';
import type { FrostLayer } from './context';
import { createFrostHost } from './host';

const layer = (): FrostLayer => ({ register: () => () => {}, glide: () => false });

describe('createFrostHost', () => {
  it('offers the newest layer and falls back when it is withdrawn', () => {
    const host = createFrostHost();
    const heard = vi.fn();
    host.subscribe(heard);
    const a = layer();
    const b = layer();

    host.offer(a);
    const withdraw = host.offer(b);
    withdraw();

    expect(host.current()).toBe(a);
    expect(heard).toHaveBeenCalledTimes(3);
  });
});
