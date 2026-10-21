import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Domains } from '../core/client';
import { domainKey } from '../core/client';
import { createRequestContext } from '../core/http';
import { createKromaClient } from '../kroma-client';
import { domainModules, domainNames, loadDomain } from './discover';

interface GlobHost {
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}

const files = Object.keys((import.meta as unknown as GlobHost).glob('./*/*.ts'));

const foldersWith = (file: string) =>
  files
    .filter((path) => path.endsWith(`/${file}`))
    .map(domainKey)
    .sort();

const folders = foldersWith('client.ts');

const ctx = createRequestContext({
  baseUrl: 'http://kroma.test',
  fetchFn: () => Promise.reject(new Error('offline')),
  token: () => 'bearer',
  locale: () => undefined,
  refresh: () => Promise.resolve(undefined),
  mediaTicket: () => 'ticket',
  setMediaTicket: () => undefined,
});

const anything: unknown = new Proxy(() => anything, {
  get: (_target, key) => {
    if (key === Symbol.toPrimitive) return () => 'x';
    return key === 'then' ? undefined : anything;
  },
});

function membersOf(node: object, path: string): [string, (...args: unknown[]) => unknown][] {
  return Object.entries(node).flatMap(([name, member]) => {
    if (typeof member === 'function') return [[`${path}.${name}`, member]] as const;
    if (typeof member === 'object' && member !== null) return membersOf(member, `${path}.${name}`);
    return [];
  });
}

describe('domain discovery', () => {
  it('finds a client for every domain folder, and no domain the folders do not have', () => {
    expect([...domainNames].sort()).toEqual(folders);
  });

  it('names each domain after its folder, so a key cannot drift from a path', async () => {
    const factories = await Promise.all(folders.map(loadDomain));

    expect(domainKey('./media/client.ts')).toBe('media');
    expect(domainKey('client.ts')).toBe('');
    for (const factory of factories) expect(factory).toBeTypeOf('function');
  });

  it('has no client for a name no folder has', async () => {
    expect(await loadDomain('elsewhere')).toBeUndefined();
  });

  it('keeps every client member asynchronous, so the web can import it on first call', async () => {
    const factories = await Promise.all(folders.map(loadDomain));
    const members = factories.flatMap((factory, i) =>
      factory ? membersOf(factory(ctx), folders[i] ?? '') : [],
    );

    const answers = members.map(([name, member]) => {
      const answer = member(anything, anything, anything);
      if (answer instanceof Promise) answer.catch(() => undefined);
      return [name, answer instanceof Promise] as const;
    });

    expect(answers.filter(([, isPromise]) => !isPromise)).toEqual([]);
    expect(answers.length).toBeGreaterThan(100);
  });

  it('names no member after a property every function has', async () => {
    const factories = await Promise.all(folders.map(loadDomain));
    const names = factories.flatMap((factory) =>
      factory ? membersOf(factory(ctx), '').map(([name]) => name) : [],
    );

    const clashing = names.filter((name) => name.split('.').some((step) => step in Function));

    expect(clashing).toEqual([]);
  });

  it("serves every domain's public module on demand", async () => {
    const media = await domainModules.media?.();

    expect(Object.keys(domainModules).sort()).toEqual(foldersWith('index.ts'));
    expect(media).toHaveProperty('ItemId');
  });

  it('gives the client one namespace per discovered domain', () => {
    const client = createKromaClient({ baseUrl: 'http://kroma.test' });

    for (const name of domainNames) {
      expect(client[name as keyof Domains]).toBeTypeOf('object');
    }
  });

  it('serves the namespaces the types promise', () => {
    const client = createKromaClient({ baseUrl: 'http://kroma.test' });

    expectTypeOf<keyof Domains>().toExtend<string>();
    expect(typeof client.media.item).toBe('function');
    expect(typeof client.admin.backup.export).toBe('function');
    expect(typeof client.accounts.passkeys.list).toBe('function');
  });

  it('answers a URL builder at once, from the eager half', () => {
    const client = createKromaClient({ baseUrl: 'http://kroma.test' });

    expect(client.media.logsUrl(5)).toBe('http://kroma.test/api/logs?tail=5');
  });

  it('preloads a domain by name', async () => {
    const client = createKromaClient({ baseUrl: 'http://kroma.test' });

    await expect(client.preload('admin')).resolves.toBeUndefined();
  });
});
