import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { callApi, sendApi } from './api';

function answering(status: number, body: unknown) {
  const fetch = vi.fn((_url: string, _init: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('a call to a KROMA server', () => {
  it('sends JSON and parses the answer', async () => {
    const fetch = answering(200, { token: 't' });

    const answer = await callApi(
      'http://localhost:4040/api/auth/token',
      z.object({ token: z.string() }),
      {
        method: 'POST',
        headers: { authorization: 'Bearer a' },
      },
    );

    expect(answer).toEqual({ token: 't' });
    const headers = new Headers(fetch.mock.calls[0]?.[1].headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('authorization')).toBe('Bearer a');
  });

  it.each([
    ['its method', { method: 'PATCH' }, 'PATCH http://localhost:4040/api/auth/me answered 401'],
    ['GET when it has none', undefined, 'GET http://localhost:4040/api/auth/me answered 401'],
  ])('names the route and the status it failed with, and %s', async (_case, init, message) => {
    answering(401, {});

    await expect(sendApi('http://localhost:4040/api/auth/me', init)).rejects.toThrow(message);
  });
});
