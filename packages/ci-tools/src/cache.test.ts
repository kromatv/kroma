import { describe, expect, it } from 'vitest';
import { stale } from './cache-entries';

describe('stale', () => {
  it('keeps the newest entries and hands back the rest', () => {
    const entries = [
      { id: 1, key: 'dd-a', createdAt: '2026-08-01T00:00:00Z' },
      { id: 3, key: 'dd-c', createdAt: '2026-08-23T00:00:00Z' },
      { id: 2, key: 'dd-b', createdAt: '2026-08-10T00:00:00Z' },
    ];

    expect(stale(entries, 1).map((e) => e.id)).toEqual([2, 1]);
    expect(stale(entries, 3)).toEqual([]);
  });
});
