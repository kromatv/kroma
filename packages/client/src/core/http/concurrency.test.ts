import { describe, expect, it } from 'vitest';
import { concurrencyGate } from './concurrency';

const pending = () => new Promise<never>(() => undefined);

describe('the share policy', () => {
  it('hands one in-flight promise to every identical call', async () => {
    const gate = concurrencyGate();
    let runs = 0;

    const first = gate('GET /items', { concurrency: 'share' }, async () => {
      runs += 1;
      return 'items';
    });
    const second = gate('GET /items', { concurrency: 'share' }, async () => 'other');

    await expect(second).resolves.toBe('items');
    expect(runs).toBe(1);
    await first;
  });

  it('starts afresh once the shared call has settled', async () => {
    const gate = concurrencyGate();
    let runs = 0;
    const run = () => gate('GET /items', { concurrency: 'share' }, async () => ++runs);

    await run();
    await run();

    expect(runs).toBe(2);
  });
});

describe('the latest policy', () => {
  it('aborts the call it supersedes under the same key', async () => {
    const gate = concurrencyGate();
    const seen: (AbortSignal | undefined)[] = [];
    const run = () =>
      gate('GET /search', { concurrency: 'latest' }, (s) => {
        seen.push(s);
        return pending();
      });

    run();
    run();

    expect(seen[0]?.aborted).toBe(true);
    expect(seen[1]?.aborted).toBe(false);
  });

  it('leaves a call under another key running', () => {
    const gate = concurrencyGate();
    const seen: (AbortSignal | undefined)[] = [];
    const run = (key: string) =>
      gate(key, { concurrency: 'latest' }, (s) => {
        seen.push(s);
        return pending();
      });

    run('GET /search?q=a');
    run('GET /search?q=b');

    expect(seen[0]?.aborted).toBe(false);
  });

  it("aborts on the caller's own signal as well as the policy's, carrying its reason", () => {
    const gate = concurrencyGate();
    const caller = new AbortController();
    const reason = new Error('walked away');
    let signal: AbortSignal | undefined;

    gate('GET /search', { concurrency: 'latest', signal: caller.signal }, (s) => {
      signal = s;
      return pending();
    });
    caller.abort(reason);

    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).toBe(reason);
  });

  it('starts already aborted when the caller walked away first', () => {
    const gate = concurrencyGate();
    let signal: AbortSignal | undefined;

    gate('GET /search', { concurrency: 'latest', signal: AbortSignal.abort() }, (s) => {
      signal = s;
      return pending();
    });

    expect(signal?.aborted).toBe(true);
  });
});

describe('no policy at all', () => {
  it("passes the caller's signal straight through and runs every call", async () => {
    const gate = concurrencyGate();
    const caller = new AbortController();
    const seen: (AbortSignal | undefined)[] = [];

    await gate('GET /items', { signal: caller.signal }, async (s) => seen.push(s));
    await gate('GET /items', undefined, async (s) => seen.push(s));

    expect(seen).toEqual([caller.signal, undefined]);
  });
});
