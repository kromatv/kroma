import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AscError, ascClient } from './asc-client';

vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }));
vi.mock('./asc-token', () => ({ ascToken: vi.fn(async () => 'signed') }));

const key = { keyId: 'k', issuerId: 'i', privateKey: 'p' };

const replies = (...answers: Response[]) =>
  vi.fn(async (_url: string, _init: RequestInit) => {
    const answer = answers.shift();
    if (!answer) {
      throw new Error('no more replies');
    }
    return answer;
  });

const refusal = (status: number, detail: string) =>
  Response.json({ errors: [{ code: 'STATE_ERROR', detail }] }, { status });

describe('ascClient', () => {
  it('sends the bearer token and checks the answer against the schema', async () => {
    const fetcher = replies(Response.json({ data: [{ id: '42' }] }));

    const asc = ascClient(key, fetcher);
    const body = await asc.get(
      'apps?limit=1',
      z.object({ data: z.array(z.object({ id: z.string() })) }),
    );

    expect(body).toEqual({ data: [{ id: '42' }] });
    expect(fetcher).toHaveBeenCalledWith('https://api.appstoreconnect.apple.com/v1/apps?limit=1', {
      method: 'GET',
      headers: { authorization: 'Bearer signed', 'content-type': 'application/json' },
      body: undefined,
    });
  });

  it('tries again when Apple is busy, and posts the body as JSON', async () => {
    const fetcher = replies(refusal(503, 'busy'), new Response(null, { status: 204 }));

    await ascClient(key, fetcher).post('betaGroups/g/relationships/builds', { data: [] });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[1].body).toBe('{"data":[]}');
  });

  it("gives up at once on a refusal, with Apple's own words", async () => {
    const fetcher = replies(refusal(409, 'Build is already in review'));

    const sent = ascClient(key, fetcher).post('betaAppReviewSubmissions?x=1', {});

    await expect(sent).rejects.toThrow(
      new AscError(409, 'Build is already in review', 'POST betaAppReviewSubmissions'),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('stops after four attempts when Apple stays down', async () => {
    const fetcher = replies(...Array.from({ length: 4 }, () => refusal(500, 'down')));

    await expect(ascClient(key, fetcher).get('apps', z.unknown())).rejects.toThrow(
      /answered 500: down/,
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
