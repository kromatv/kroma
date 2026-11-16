import { describe, expect, it, vi } from 'vitest';
import { answerSend, type PendingSend, type SendAnswer } from './authorizations';
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
