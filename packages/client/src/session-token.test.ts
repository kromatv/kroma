import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemStorage } from './device-storage.fixture';
import { sessionToken, setSessionToken, sharedTokenExchange } from './session-token';

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemStorage() as unknown as Storage;
});
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('the in-memory session bearer', () => {
  it('is never persisted: it starts empty, is set, and clears again', () => {
    expect(sessionToken()).toBeUndefined();
    setSessionToken('short-lived');
    expect(sessionToken()).toBe('short-lived');
    expect(
      (globalThis as { localStorage: Storage }).localStorage.getItem('kroma.session'),
    ).toBeNull();
    setSessionToken(undefined);
    expect(sessionToken()).toBeUndefined();
  });
});

describe('sharedTokenExchange', () => {
  it('leaves the newer in-flight exchange alone when a nested one settles', async () => {
    let release: (v: { token: string; user: string }) => void = () => {};
    let nested: Promise<{ token: string; user: string }> | undefined;

    const outer = sharedTokenExchange<string>(() => {
      nested = sharedTokenExchange<string>(async () => ({ token: 'inner', user: 'i' }));
      return new Promise<{ token: string; user: string }>((r) => {
        release = r;
      });
    });

    await expect(nested).resolves.toEqual({ token: 'inner', user: 'i' });

    const joined = sharedTokenExchange<string>(async () => ({ token: 'never', user: 'n' }));
    expect(joined).toBe(outer);

    release({ token: 'outer', user: 'o' });
    await expect(outer).resolves.toEqual({ token: 'outer', user: 'o' });
  });

  it('coalesces overlapping exchanges into one, then allows a fresh one after settle', async () => {
    let resolveFn: (v: { token: string; user: unknown }) => void = () => {};
    const exchange = vi.fn(
      () => new Promise<{ token: string; user: unknown }>((r) => (resolveFn = r)),
    );

    const p1 = sharedTokenExchange(exchange);
    const p2 = sharedTokenExchange(exchange);
    expect(p1).toBe(p2);
    expect(exchange).toHaveBeenCalledTimes(1);

    resolveFn({ token: 'tok', user: { id: 'u1' } });
    await p1;

    // Once the in-flight exchange settled, a new call starts a new one.
    sharedTokenExchange(exchange);
    expect(exchange).toHaveBeenCalledTimes(2);
  });
});
