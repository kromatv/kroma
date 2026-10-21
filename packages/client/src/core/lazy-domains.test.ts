import { describe, expect, it, vi } from 'vitest';
import type { DomainFactory, Domains } from './client';
import { createRequestContext, type RequestContext } from './http';
import { bindLazyDomains } from './lazy-domains';

const ctx = createRequestContext({
  baseUrl: 'http://kroma.test',
  fetchFn: () => Promise.reject(new Error('offline')),
  token: () => undefined,
  locale: () => undefined,
  refresh: () => Promise.resolve(undefined),
  mediaTicket: () => undefined,
  setMediaTicket: () => undefined,
});

const notesApi = (bound: RequestContext) => ({
  list: async () => [bound.baseUrl],
  folders: {
    open: async (id: string) => `${bound.baseUrl}/folders/${id}`,
  },
  cover: {
    bytes: async (id: string) => `bytes of ${id}`,
  },
  count: 3,
});

const notesUrls = (bound: RequestContext) => ({
  pageUrl: (id: string) => `${bound.baseUrl}/notes/${id}`,
  cover: {
    url: (id: string) => `${bound.baseUrl}/covers/${id}`,
  },
});

interface Notes {
  list(): Promise<string[]>;
  folders: { open(id: string): Promise<string> };
  cover: { bytes(id: string): Promise<string>; url(id: string): string };
  count: () => Promise<number>;
  pageUrl(id: string): string;
  missing: () => Promise<unknown>;
}

function notes(loader = vi.fn(() => Promise.resolve<DomainFactory>(notesApi))) {
  const bound = bindLazyDomains(ctx, { notes: loader }, { notes: notesUrls });
  const namespace = (bound.domains as unknown as { notes: Notes }).notes;
  return { loader, namespace, preload: bound.preload };
}

describe('a lazily bound domain', () => {
  it('imports its client on the first call, and binds it to the client context', async () => {
    const { loader, namespace } = notes();

    const listed = await namespace.list();

    expect(listed).toEqual(['http://kroma.test']);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('imports once across later calls', async () => {
    const { loader, namespace } = notes();

    await namespace.list();
    await namespace.folders.open('f1');

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('shares one import between calls made before it resolves', async () => {
    const { loader, namespace } = notes();

    const answers = await Promise.all([namespace.list(), namespace.folders.open('f1')]);

    expect(answers).toEqual([['http://kroma.test'], 'http://kroma.test/folders/f1']);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('answers its synchronous members without importing the client', () => {
    const { loader, namespace } = notes();

    const url = namespace.pageUrl('n1');

    expect(url).toBe('http://kroma.test/notes/n1');
    expect(loader).not.toHaveBeenCalled();
  });

  it('merges a sub-namespace both halves fill', async () => {
    const { namespace } = notes();

    const halves = [namespace.cover.url('c1'), await namespace.cover.bytes('c1')];

    expect(halves).toEqual(['http://kroma.test/covers/c1', 'bytes of c1']);
  });

  it('hands back the same member each time it is read', () => {
    const { namespace } = notes();

    expect(namespace.list).toBe(namespace.list);
    expect(namespace.folders.open).toBe(namespace.folders.open);
  });

  it('is not mistaken for a promise when awaited', async () => {
    const { loader, namespace } = notes();

    const awaited = await Promise.resolve(namespace.folders);

    expect(awaited).toBe(namespace.folders);
    expect(loader).not.toHaveBeenCalled();
  });

  it('lets a test spy on a member it has not read yet', async () => {
    const { loader, namespace } = notes();

    vi.spyOn(namespace, 'list').mockResolvedValue(['spied']);

    expect(await namespace.list()).toEqual(['spied']);
    expect(loader).not.toHaveBeenCalled();
  });

  it('rejects a call to a member the client does not have, by its full name', async () => {
    const { namespace } = notes();

    const missing = namespace.missing();
    const counted = namespace.count();

    await expect(missing).rejects.toThrow('notes.missing is not a function');
    await expect(counted).rejects.toThrow('notes.count is not a function');
  });

  it('imports again after a failed import', async () => {
    const loader = vi
      .fn<() => Promise<DomainFactory>>()
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValue(notesApi);
    const { namespace } = notes(loader);

    await expect(namespace.list()).rejects.toThrow('chunk failed');
    const listed = await namespace.list();

    expect(listed).toEqual(['http://kroma.test']);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe('preloading a domain', () => {
  it('imports it ahead of the first call, which then imports nothing', async () => {
    const { loader, namespace, preload } = notes();

    await preload('notes' as keyof Domains);
    await namespace.list();

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('resolves for a domain nothing discovered', async () => {
    const { loader, preload } = notes();

    await preload('elsewhere' as keyof Domains);

    expect(loader).not.toHaveBeenCalled();
  });
});
