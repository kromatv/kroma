import { describe, expect, it } from 'vitest';
import { settle } from './outcome';

describe('settle', () => {
  it('hands back the value of work that succeeded', async () => {
    expect(await settle(Promise.resolve(3))).toEqual({ ok: true, value: 3 });
  });

  it('hands back the message of work that threw', async () => {
    expect(await settle(Promise.reject(new Error('dryer exited 2')))).toEqual({
      ok: false,
      reason: 'dryer exited 2',
    });
  });

  it('spells out a rejection that is not an Error', async () => {
    const rejected = Promise.reject<number>('plain text');

    expect(await settle(rejected)).toEqual({ ok: false, reason: 'plain text' });
  });
});
