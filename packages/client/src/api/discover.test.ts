import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Domains } from '../core/client';
import { domainKey } from '../core/client';
import { createKromaClient } from '../kroma-client';
import { domains } from './discover';

interface GlobHost {
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}

const folders = Object.keys((import.meta as unknown as GlobHost).glob('./*/*.ts'))
  .filter((path) => path.endsWith('/client.ts'))
  .map(domainKey)
  .sort();

describe('domain discovery', () => {
  it('finds a client for every domain folder, and no domain the folders do not have', () => {
    expect(Object.keys(domains).sort()).toEqual(folders);
  });

  it('names each domain after its folder, so a key cannot drift from a path', () => {
    expect(domainKey('./media/client.ts')).toBe('media');
    expect(domainKey('client.ts')).toBe('');
    for (const name of folders) expect(domains[name]).toBeTypeOf('function');
  });

  it('gives the client one namespace per discovered domain', () => {
    const client = createKromaClient({ baseUrl: 'http://kroma.test' });

    for (const name of Object.keys(domains)) {
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
});
