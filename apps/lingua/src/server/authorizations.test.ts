import { describe, expect, it, vi } from 'vitest';
import { answerSend, type PendingSend, pendingCookie, readPending, type SendAnswer } from './authorizations';
import type { ProposalResult } from './proposals';
import { ada } from './test-support';

const pending: PendingSend = { state: 's', project: 'o/r', locale: 'fr', to: '/o/r/fr' };

const proposed: ProposalResult = {
  status: 200,
  body: { kind: 'proposed', number: 9, url: 'https://github.com/o/r/pull/9' },
};

function gitHubGranting(grant: { scope: string; id: number }): typeof fetch {
  return async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    return url.endsWith('/login/oauth/access_token')
      ? Response.json({ access_token: 'gho_x', token_type: 'bearer', scope: grant.scope })
      : Response.json({ id: grant.id, login: 'ada' });
  };
}

function answer(over: Partial<SendAnswer>): SendAnswer {
  return {
    oauth: { clientId: 'id', clientSecret: 'secret' },
    pending,
    viewer: ada,
    query: { code: 'c', error: undefined },
    redirectUri: 'https://lingua.test/auth/callback',
    send: async () => proposed,
    ...over,
  };
}

describe('answerSend', () => {
  it('returns a refused permission to its page as declined, sending nothing', async () => {
    const send = vi.fn(async () => proposed);

    const to = await answerSend(answer({ query: { code: undefined, error: 'access_denied' }, send }));

    expect(to).toBe('/o/r/fr?send=declined');
    expect(send).not.toHaveBeenCalled();
  });

  it('takes a permission granted without public_repo as declined', async () => {
    const send = vi.fn(async () => proposed);

    const to = await answerSend(answer({ fetchFn: gitHubGranting({ scope: '', id: 42 }), send }));

    expect(to).toBe('/o/r/fr?send=declined');
    expect(send).not.toHaveBeenCalled();
  });

  it('sends as the account that granted public_repo and returns with its pull request', async () => {
    const send = vi.fn(async () => proposed);

    const to = await answerSend(
      answer({ fetchFn: gitHubGranting({ scope: 'public_repo', id: 42 }), send }),
    );

    expect(to).toBe('/o/r/fr?sent=9');
    expect(send).toHaveBeenCalledWith(expect.anything(), ada);
  });

  it('sends nothing for a GitHub account other than the one signed in', async () => {
    const send = vi.fn(async () => proposed);

    const to = await answerSend(
      answer({ fetchFn: gitHubGranting({ scope: 'public_repo', id: 7 }), send }),
    );

    expect(to).toBe('/o/r/fr?send=other-account');
    expect(send).not.toHaveBeenCalled();
  });

  it('returns a refused send with the reason the page reads it by', async () => {
    const send = async (): Promise<ProposalResult> => ({ status: 503, reason: 'forking', error: '' });

    const to = await answerSend(
      answer({ fetchFn: gitHubGranting({ scope: 'public_repo', id: 42 }), send }),
    );

    expect(to).toBe('/o/r/fr?send=forking');
  });
});

describe('answerSend when GitHub’s answer cannot be used', () => {
  it('returns a send as expired once the browser came back signed out', async () => {
    expect(await answerSend(answer({ viewer: null }))).toBe('/o/r/fr?send=expired');
  });

  it('returns a send as failed when GitHub would not trade the code', async () => {
    const fetchFn: typeof fetch = async () => Response.json({ error: 'bad_verification_code' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await answerSend(answer({ fetchFn }))).toBe('/o/r/fr?send=failed');
  });

  it('returns a send that found nothing left to carry', async () => {
    const send = async (): Promise<ProposalResult> => ({ status: 200, body: { kind: 'nothing' } });

    const to = await answerSend(answer({ fetchFn: gitHubGranting({ scope: 'repo', id: 42 }), send }));

    expect(to).toBe('/o/r/fr?send=nothing');
  });
});

describe('readPending', () => {
  it('reads back the send its cookie remembers', () => {
    const header = `other=1; ${pendingCookie(pending).split(';')[0]}`;

    expect(readPending(header)).toEqual(pending);
  });

  it('reads no send from a cookie that is missing, not JSON, or not a send', () => {
    const cookies = [undefined, '__Host-lingua_send=%7B', `__Host-lingua_send=${encodeURIComponent('{"state":""}')}`];

    expect(cookies.map((header) => readPending(header))).toEqual([null, null, null]);
  });
});
