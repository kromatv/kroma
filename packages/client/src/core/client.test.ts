import { describe, expect, it } from 'vitest';
import { bindDomains, type Domains } from './client';
import { createRequestContext, type RequestContext } from './http';

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
  cover: { bytes: async (id: string) => `bytes of ${id}` },
  tags: ['loaded'],
});

const notesUrls = (bound: RequestContext) => ({
  pageUrl: (id: string) => `${bound.baseUrl}/notes/${id}`,
  cover: { url: (id: string) => `${bound.baseUrl}/covers/${id}` },
  tags: ['eager'],
});

interface Notes {
  list(): Promise<string[]>;
  cover: { bytes(id: string): Promise<string>; url(id: string): string };
  pageUrl(id: string): string;
  tags: string[];
}

const notesOf = (domains: Domains) => (domains as unknown as { notes: Notes }).notes;

describe('binding every domain up front', () => {
  it('joins both halves of a domain into one namespace, sub-namespaces merged', async () => {
    const notes = notesOf(bindDomains(ctx, { notes: notesApi }, { notes: notesUrls }).domains);

    expect(notes.pageUrl('n1')).toBe('http://kroma.test/notes/n1');
    expect(notes.cover.url('c1')).toBe('http://kroma.test/covers/c1');
    expect(await notes.cover.bytes('c1')).toBe('bytes of c1');
    expect(await notes.list()).toEqual(['http://kroma.test']);
  });

  it('lets the client half win a member both halves name', () => {
    const notes = notesOf(bindDomains(ctx, { notes: notesApi }, { notes: notesUrls }).domains);

    expect(notes.tags).toEqual(['loaded']);
  });

  it('binds a domain that has no eager half', async () => {
    const notes = notesOf(bindDomains(ctx, { notes: notesApi }).domains);

    expect(await notes.list()).toEqual(['http://kroma.test']);
  });

  it('has nothing left to preload', async () => {
    const bound = bindDomains(ctx, { notes: notesApi });

    await expect(bound.preload('notes' as keyof Domains)).resolves.toBeUndefined();
  });
});
