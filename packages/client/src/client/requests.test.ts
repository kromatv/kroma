import { describe, expect, it } from 'vitest';
import type { CreateRequestBody, GrabBody } from '../types';
import type { RequestContext } from './base';
import {
  approveRequest,
  createRequest,
  deleteRequest,
  denyRequest,
  getCalendar,
  getMissing,
  grabRelease,
  listRequests,
} from './requests';

function recordCtx() {
  const calls: { path: string; init?: RequestInit }[] = [];
  const ctx = {
    baseUrl: 'http://nas',
    json: async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return {} as never;
    },
  } as unknown as RequestContext;
  return { ctx, calls };
}

describe('mine filter', () => {
  it('adds ?mine=true only when requested', () => {
    const { ctx, calls } = recordCtx();
    void listRequests(ctx);
    void listRequests(ctx, { mine: true });
    void getCalendar(ctx, { mine: true });
    void getMissing(ctx);
    void getMissing(ctx, { mine: true });
    expect(calls.map((c) => c.path)).toEqual([
      '/requests',
      '/requests?mine=true',
      '/requests/calendar?mine=true',
      '/requests/missing',
      '/requests/missing?mine=true',
    ]);
  });
});

describe('moderation endpoints', () => {
  it('approve/delete use the encoded id and right verb', () => {
    const { ctx, calls } = recordCtx();
    void approveRequest(ctx, 'r 1');
    void deleteRequest(ctx, 'r 2');
    expect(calls[0]).toMatchObject({ path: '/requests/r%201/approve', init: { method: 'POST' } });
    expect(calls[1]).toMatchObject({ path: '/requests/r%202', init: { method: 'DELETE' } });
  });

  it('denyRequest sends a note object, or an empty object without one', () => {
    const { ctx, calls } = recordCtx();
    void denyRequest(ctx, 'r1', 'not available');
    void denyRequest(ctx, 'r2');
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ note: 'not available' });
    expect(JSON.parse(calls[1]?.init?.body as string)).toEqual({});
  });
});

describe('createRequest / grabRelease bodies', () => {
  it('POSTs the JSON body', () => {
    const { ctx, calls } = recordCtx();
    const body = { kind: 'movie', tmdbId: 603 } as unknown as CreateRequestBody;
    void createRequest(ctx, body);
    const grab = { guid: 'g', indexerId: 'i' } as unknown as GrabBody;
    void grabRelease(ctx, 'r1', grab);
    expect(calls[0]?.path).toBe('/requests');
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual(body);
    expect(calls[1]?.path).toBe('/requests/r1/grab');
    expect(JSON.parse(calls[1]?.init?.body as string)).toEqual(grab);
  });
});
