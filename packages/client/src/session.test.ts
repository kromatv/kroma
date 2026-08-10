import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  deviceStorage,
  forgetAccount,
  forgetServer,
  loadAccounts,
  loadLocalePref,
  loadServers,
  loadSession,
  migrateStorage,
  normalizeServerUrl,
  type StoredSession,
  saveLocalePref,
  saveServer,
  saveSession,
  sessionToken,
  setSessionStorage,
  setSessionToken,
  sharedTokenExchange,
  touchServer,
} from './session';
import type { User } from './types';

// Minimal in-memory localStorage so the DOM-guarded helpers have real storage.
class MemStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemStorage() as unknown as Storage;
});
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

const U = (id: string): User => ({ id }) as unknown as User;
const session = (id: string, serverUrl?: string): StoredSession => ({
  accessToken: `tok-${id}`,
  user: U(id),
  serverUrl,
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

describe('deviceStorage', () => {
  afterEach(() => setSessionStorage(null));

  it('hands out the installed store, the browser one, or null where there is neither', () => {
    expect(deviceStorage()).toBe((globalThis as { localStorage: Storage }).localStorage);
    const custom = { getItem: () => null, setItem() {}, removeItem() {} };
    setSessionStorage(custom);
    expect(deviceStorage()).toBe(custom);
    setSessionStorage(null);
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(deviceStorage()).toBeNull();
  });
});

describe('normalizeServerUrl', () => {
  it('strips trailing slashes and tolerates null/undefined', () => {
    expect(normalizeServerUrl('http://nas:4040/')).toBe('http://nas:4040');
    expect(normalizeServerUrl('http://nas:4040///')).toBe('http://nas:4040');
    expect(normalizeServerUrl('http://nas:4040')).toBe('http://nas:4040');
    expect(normalizeServerUrl('http://nas/a/')).toBe('http://nas/a');
    expect(normalizeServerUrl(null)).toBe('');
    expect(normalizeServerUrl(undefined)).toBe('');
  });
});

describe('active session', () => {
  it('saves and loads the active session and remembers the account', () => {
    saveSession(session('u1'));
    expect(loadSession()?.user.id).toBe('u1');
    expect(loadAccounts().map((a) => a.user.id)).toEqual(['u1']);
  });

  it('returns null when there is no session', () => {
    expect(loadSession()).toBeNull();
  });

  it('de-dupes the remembered account by (user, scope), newest first', () => {
    saveSession(session('u1'));
    saveSession(session('u2'));
    saveSession(session('u1')); // re-sign-in of u1 moves it to front, no dup
    expect(loadAccounts().map((a) => a.user.id)).toEqual(['u1', 'u2']);
  });

  it('keeps same user id on different servers as distinct profiles', () => {
    saveSession(session('u1', 'http://a'));
    saveSession(session('u1', 'http://b'));
    expect(loadAccounts()).toHaveLength(2);
    expect(loadAccounts('http://a').map((a) => a.user.id)).toEqual(['u1']);
  });

  it('clearSession drops only the active session, not the roster', () => {
    saveSession(session('u1'));
    clearSession();
    expect(loadSession()).toBeNull();
    expect(loadAccounts()).toHaveLength(1);
  });
});

describe('forgetAccount', () => {
  it('removes a remembered account and clears the active session when it matches', () => {
    saveSession(session('u1'));
    forgetAccount('u1');
    expect(loadAccounts()).toHaveLength(0);
    expect(loadSession()).toBeNull();
  });

  it('scopes the removal to a server when one is given', () => {
    saveSession(session('u1', 'http://a'));
    saveSession(session('u1', 'http://b'));
    forgetAccount('u1', 'http://a');
    expect(loadAccounts().map((a) => a.serverUrl)).toEqual(['http://b']);
  });
});

describe('saved servers', () => {
  it('adds, orders by recency, and touches servers', () => {
    saveServer({ url: 'http://a', name: 'A', lastUsedAt: 100 });
    saveServer({ url: 'http://b', name: 'B', lastUsedAt: 200 });
    expect(loadServers().map((s) => s.url)).toEqual(['http://b', 'http://a']);
    touchServer('http://a'); // now most-recent
    expect(loadServers()[0]?.url).toBe('http://a');
  });

  it('is idempotent on the normalized URL and preserves a known name', () => {
    saveServer({ url: 'http://a', name: 'A' });
    saveServer({ url: 'http://a/' }); // trailing slash + no name
    const list = loadServers();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('A');
  });

  it('forgetServer drops the server, its accounts, and a matching active session', () => {
    saveServer({ url: 'http://a' });
    saveSession(session('u1', 'http://a'));
    forgetServer('http://a');
    expect(loadServers()).toHaveLength(0);
    expect(loadAccounts()).toHaveLength(0);
    expect(loadSession()).toBeNull();
  });

  it('forgetServer leaves a session signed into another server standing', () => {
    saveServer({ url: 'http://a' });
    saveSession(session('u1', 'http://b'));
    forgetServer('http://a');
    expect(loadSession()?.user.id).toBe('u1');
  });

  it('reads a stored server that predates the recency stamp as never used', () => {
    (globalThis as { localStorage: Storage }).localStorage.setItem(
      'kroma.servers',
      JSON.stringify([{ url: 'http://a/' }]),
    );
    expect(loadServers()).toEqual([{ url: 'http://a', name: null, lastUsedAt: 0 }]);
  });
});

describe('locale preference', () => {
  it('persists and clears the device locale', () => {
    expect(loadLocalePref()).toBeNull();
    saveLocalePref('en');
    expect(loadLocalePref()).toBe('en');
    saveLocalePref(null);
    expect(loadLocalePref()).toBeNull();
  });
});

describe('migrateStorage', () => {
  it('seeds servers, stamps accounts/session and drops the legacy key', () => {
    const ls = (globalThis as { localStorage: Storage }).localStorage;
    ls.setItem('kroma.serverUrl', 'http://old/');
    ls.setItem('kroma.accounts', JSON.stringify([{ accessToken: 't', user: { id: 'u1' } }]));
    ls.setItem('kroma.session', JSON.stringify({ accessToken: 't', user: { id: 'u1' } }));

    migrateStorage();

    expect(loadServers().map((s) => s.url)).toEqual(['http://old']);
    expect(loadAccounts()[0]?.serverUrl).toBe('http://old');
    expect(loadSession()?.serverUrl).toBe('http://old');
    expect(ls.getItem('kroma.serverUrl')).toBeNull();
  });

  it('is a no-op without a legacy key', () => {
    migrateStorage();
    expect(loadServers()).toHaveLength(0);
  });

  it('leaves an already-scoped store alone but still drops the legacy key', () => {
    const ls = (globalThis as { localStorage: Storage }).localStorage;
    ls.setItem('kroma.serverUrl', 'http://old');
    ls.setItem('kroma.servers', JSON.stringify([{ url: 'http://new', name: 'N', lastUsedAt: 5 }]));
    const scoped = { accessToken: 't', user: { id: 'u1' }, serverUrl: 'http://new' };
    ls.setItem('kroma.accounts', JSON.stringify([scoped]));
    ls.setItem('kroma.session', JSON.stringify(scoped));

    migrateStorage();

    expect(loadServers().map((s) => s.url)).toEqual(['http://new']);
    expect(loadAccounts()[0]?.serverUrl).toBe('http://new');
    expect(loadSession()?.serverUrl).toBe('http://new');
    expect(ls.getItem('kroma.serverUrl')).toBeNull();
  });
});

describe('malformed storage', () => {
  it('falls back gracefully on unparseable JSON', () => {
    (globalThis as { localStorage: Storage }).localStorage.setItem('kroma.session', '{not json');
    expect(loadSession()).toBeNull();
  });
});

describe('a store that refuses to answer', () => {
  afterEach(() => setSessionStorage(null));

  it('degrades to signed-out when reading localStorage itself throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('access denied');
      },
    });
    expect(loadSession()).toBeNull();
    expect(loadAccounts()).toEqual([]);
    expect(loadLocalePref()).toBeNull();
    expect(() => saveSession(session('u1'))).not.toThrow();
    expect(() => saveLocalePref('fr')).not.toThrow();
    expect(() => clearSession()).not.toThrow();
    expect(() => migrateStorage()).not.toThrow();
  });

  it('degrades when the installed device store throws on every read', () => {
    setSessionStorage({
      getItem() {
        throw new Error('device store unavailable');
      },
      setItem() {
        throw new Error('device store unavailable');
      },
      removeItem() {
        throw new Error('device store unavailable');
      },
    });
    expect(loadLocalePref()).toBeNull();
    expect(() => migrateStorage()).not.toThrow();
    expect(() => saveLocalePref('fr')).not.toThrow();
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
