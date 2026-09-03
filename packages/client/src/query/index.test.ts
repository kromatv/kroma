import { describe, expect, expectTypeOf, it } from 'vitest';
import { ItemId, type MediaItem } from '../api/media';
import { createQueryClient } from '.';

const options = () => createQueryClient({ baseUrl: 'http://kroma.test' });

describe('query options', () => {
  it('carries every read of every domain, and its sub-namespaces', () => {
    const client = options();

    expect(typeof client.query.media.item).toBe('function');
    expect(typeof client.query.admin.backup.export).toBe('function');
    expect(typeof client.query.accounts.passkeys.list).toBe('function');
  });

  it('offers no URL builder: one answers a string, which is not a request', () => {
    const client = options();

    // @ts-expect-error `streamUrl` returns a string, so it is not a query.
    expectTypeOf(client.query.media.streamUrl).toBeCallableWith();
  });

  it('keys a read by the server, the path through the namespaces and the arguments', () => {
    const client = options();

    expect(client.query.media.item(ItemId.parse('i1')).queryKey).toEqual([
      'kroma',
      'http://kroma.test',
      'media',
      'item',
      'i1',
    ]);
  });

  it('gives two different arguments two different keys', () => {
    const client = options();

    expect(client.query.media.item(ItemId.parse('i1')).queryKey).not.toEqual(
      client.query.media.item(ItemId.parse('i2')).queryKey,
    );
  });

  it('infers what the endpoint answers', () => {
    const client = options();

    expectTypeOf(
      client.query.media.item(ItemId.parse('i1')).queryFn,
    ).returns.resolves.toEqualTypeOf<MediaItem>();
  });

  it('hands the runner’s signal to the request it makes', async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init?.signal);
      return { ok: true, status: 200, text: async () => '{}', body: null } as Response;
    }) as typeof globalThis.fetch;
    const client = createQueryClient({ baseUrl: 'http://kroma.test', fetch });
    const controller = new AbortController();

    await client.query.media
      .item(ItemId.parse('i1'))
      .queryFn({ signal: controller.signal })
      .catch(() => undefined);

    expect(seen[0]).toBe(controller.signal);
  });
});
