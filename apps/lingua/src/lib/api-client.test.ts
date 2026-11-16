import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '#site/core/checks';
import {
  ApiError,
  confirmMessages,
  saveEdit,
  sendProposal,
  signInUrl,
  startLanguage,
} from './api-client';

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

    expect(await sendProposal({ project: 'o/r', locale: 'fr', to: '/o/r/fr' })).toEqual({
      kind: 'authorize',
      url,
    });
  });
});

describe('confirmMessages', () => {
  it('posts the keys to confirm and reads the base keys the server kept', async () => {
    const fetchFn = serverAnswering(Response.json({ confirmed: ['p.n'] }));
    const target = { project: 'o/r', locale: 'fr', keys: ['p.n_one'] };

    expect(await confirmMessages(target)).toEqual(['p.n']);
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/confirm',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(target) }),
    );
  });
});

describe('startLanguage', () => {
  it('posts the language to start and reads its name', async () => {
    const fetchFn = serverAnswering(Response.json({ locale: 'de', name: 'Deutsch' }));

    expect(await startLanguage({ project: 'o/r', locale: 'de' })).toEqual({
      locale: 'de',
      name: 'Deutsch',
    });
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/locales',
      expect.objectContaining({ method: 'POST', body: '{"project":"o/r","locale":"de"}' }),
    );
  });

  it('throws the refusal for a language the project has', async () => {
    serverAnswering(
      Response.json({ error: 'The project has that language already' }, { status: 409 }),
    );

    await expect(startLanguage({ project: 'o/r', locale: 'fr' })).rejects.toMatchObject({
      status: 409,
      message: 'The project has that language already',
    });
  });
});

describe('signInUrl', () => {
  it('carries the page to come back to', () => {
    expect(signInUrl('/o/r/fr?x=1')).toBe('/auth/login?to=%2Fo%2Fr%2Ffr%3Fx%3D1');
  });
});
