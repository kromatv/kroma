import { describe, expect, it } from 'vitest';
import { readBoundedJson } from './body';

const streamed = (chunks: readonly Uint8Array[], status = 200) =>
  ({
    status,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  }) as unknown as Response;

const bodiless = (text: string, status = 200) =>
  ({ status, body: null, text: async () => text }) as unknown as Response;

const encode = (s: string) => new TextEncoder().encode(s);

describe('reading a JSON body', () => {
  it('reassembles a body split across chunks', async () => {
    const res = streamed([encode('{"a":'), encode('1}')]);

    await expect(readBoundedJson(res, '/items')).resolves.toEqual({ a: 1 });
  });

  it('answers undefined for a status that carries no body', async () => {
    await expect(readBoundedJson(bodiless('', 204), '/items')).resolves.toBeUndefined();
    await expect(readBoundedJson(bodiless('', 205), '/items')).resolves.toBeUndefined();
  });

  it('answers undefined for an empty 200', async () => {
    await expect(readBoundedJson(bodiless(''), '/items')).resolves.toBeUndefined();
  });

  it('reads a runtime that hands out no stream through text()', async () => {
    await expect(readBoundedJson(bodiless('{"a":1}'), '/items')).resolves.toEqual({ a: 1 });
  });

  it('refuses a body past the bound, naming the route that sent it', async () => {
    const huge = { status: 200, body: null, text: async () => 'x'.repeat(64 * 1024 * 1024 + 1) };

    await expect(readBoundedJson(huge as unknown as Response, '/items')).rejects.toThrow('/items');
  });
});
