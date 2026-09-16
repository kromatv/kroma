import { describe, expect, it } from 'vitest';
import { addressKey, takeDaily } from './limits';
import { memoryCounters } from './test-support';

const DAY = 24 * 60 * 60;

describe('daily budgets', () => {
  it('admit `limit` takes, then refuse until the day turns', async () => {
    const kv = memoryCounters();
    const now = 100 * DAY + 5;

    expect(await takeDaily(kv, 'k', 2, now)).toBe(true);
    expect(await takeDaily(kv, 'k', 2, now)).toBe(true);
    expect(await takeDaily(kv, 'k', 2, now)).toBe(false);
    expect(await takeDaily(kv, 'k', 2, now + DAY)).toBe(true);
  });

  it('keep one key’s budget apart from another’s', async () => {
    const kv = memoryCounters();

    expect(await takeDaily(kv, 'a', 1, 0)).toBe(true);
    expect(await takeDaily(kv, 'b', 1, 0)).toBe(true);
    expect(await takeDaily(kv, 'a', 1, 0)).toBe(false);
  });
});

describe('the address key', () => {
  it('is stable, case-blind and reveals nothing', async () => {
    const a = await addressKey('s', 'Reader@Example.test');

    expect(await addressKey('s', 'reader@example.test ')).toBe(a);
    expect(await addressKey('s', 'other@example.test')).not.toBe(a);
    expect(await addressKey('another', 'reader@example.test')).not.toBe(a);
    expect(a).not.toMatch(/reader|example/i);
  });
});
