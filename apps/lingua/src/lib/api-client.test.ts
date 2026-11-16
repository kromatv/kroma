import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '#site/core/checks';
import { ApiError, saveEdit, sendProposal, signInUrl } from './api-client';

const EDIT = { project: 'o/r', locale: 'fr', file: 'p', key: 'p.play', value: 'Lire {title}' };

function serverAnswering(response: Response) {
  const fetchFn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response);
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveEdit', () => {
  it('puts the edit as JSON with the session cookie and reads what the server kept', async () => {
    const fetchFn = serverAnswering(Response.json({ draft: 'Lire {title}', issues: [] }));

    const saved = await saveEdit(EDIT);

    expect(saved).toEqual({ draft: 'Lire {title}', issues: [] });
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/edits',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(EDIT),
        credentials: 'same-origin',
      }),
    );
  });

  it('throws the server’s refusal with the issues that blocked the save', async () => {
    const issues: Issue[] = [{ level: 'error', code: 'unknown-token', detail: 'name' }];
    serverAnswering(Response.json({ error: 'Fix the issues', issues }, { status: 422 }));

    const saving = saveEdit(EDIT);

    await expect(saving).rejects.toEqual(new ApiError(422, 'Fix the issues', issues));
    await expect(saving).rejects.toMatchObject({ status: 422, issues });
  });

  it('throws the status text for a refusal that is not the server’s JSON', async () => {
    serverAnswering(new Response('<html>', { status: 502, statusText: 'Bad Gateway' }));

    await expect(saveEdit(EDIT)).rejects.toMatchObject({
      status: 502,
      message: 'Bad Gateway',
      issues: [],
    });
  });

  it('keeps no issues off a refusal that lists none', async () => {
    serverAnswering(Response.json({ error: 'Sign in' }, { status: 401 }));

    await expect(saveEdit(EDIT)).rejects.toMatchObject({
      status: 401,
      message: 'Sign in',
      issues: [],
    });
  });
});

describe('sendProposal', () => {
  it('reads GitHub’s page asking the contributor for permission', async () => {
    const url = 'https://github.com/login/oauth/authorize?client_id=x';
    serverAnswering(Response.json({ kind: 'authorize', url }));

    expect(
      await sendProposal({ project: 'o/r', locale: 'fr', via: 'fork', to: '/o/r/fr' }),
    ).toEqual({ kind: 'authorize', url });
  });
});

describe('signInUrl', () => {
  it('carries the page to come back to', () => {
    expect(signInUrl('/o/r/fr?x=1')).toBe('/auth/login?to=%2Fo%2Fr%2Ffr%3Fx%3D1');
  });
});
