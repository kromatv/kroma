import { describe, expect, it } from 'vitest';
import { recordingClient } from '../../kroma-client.fixture';

const PENDING = { status: 'pending' };

function pollClient(reply: (url: string) => { ok?: boolean; status?: number; json?: unknown }) {
  return recordingClient(reply);
}

describe('initiate', () => {
  it('names no previous secret when there is nothing to revoke', async () => {
    const { client, calls } = pollClient(() => ({ json: {} }));

    await client.accounts.quickConnect.initiate().catch(() => undefined);

    expect(calls[0]?.path).toBe('/auth/quickconnect/initiate');
    expect(calls[0]?.body).toEqual({});
  });

  it('carries the previous secret when one is rotating out', async () => {
    const { client, calls } = pollClient(() => ({ json: {} }));

    await client.accounts.quickConnect.initiate('old').catch(() => undefined);

    expect(calls[0]?.body).toEqual({ prevSecret: 'old' });
  });
});

describe('poll', () => {
  it('sends the secret in a header, never in the URL', async () => {
    const { client, calls } = pollClient(() => ({ json: PENDING }));

    await client.accounts.quickConnect.poll('sec');

    expect(calls[0]?.path).toBe('/auth/quickconnect/poll');
    expect(calls[0]?.headers.get('x-kroma-pairing-secret')).toBe('sec');
  });

  it('carries no bearer: a pre-auth handshake has none to carry', async () => {
    const { client, calls } = recordingClient(() => ({ json: PENDING }), { authToken: 'tok' });

    await client.accounts.quickConnect.poll('sec');

    expect(calls[0]?.headers.get('Authorization')).toBeNull();
  });

  it('retries with the legacy query when the server is too old to read the header', async () => {
    let seen = 0;
    const { client, calls } = pollClient(() => {
      seen += 1;
      return seen === 1 ? { ok: false, status: 400, json: {} } : { json: PENDING };
    });

    await expect(client.accounts.quickConnect.poll('sec')).resolves.toEqual(PENDING);
    expect(calls[1]?.path).toBe('/auth/quickconnect/poll?secret=sec');
  });

  it('keeps polling the legacy way once a server has demanded it, without asking twice', async () => {
    let seen = 0;
    const { client, calls } = pollClient(() => {
      seen += 1;
      return seen === 1 ? { ok: false, status: 400, json: {} } : { json: PENDING };
    });

    await client.accounts.quickConnect.poll('sec');
    await client.accounts.quickConnect.poll('sec');

    expect(calls.map((c) => c.path)).toEqual([
      '/auth/quickconnect/poll',
      '/auth/quickconnect/poll?secret=sec',
      '/auth/quickconnect/poll?secret=sec',
    ]);
  });

  it('does not downgrade on a failure an updated server can produce', async () => {
    const { client } = pollClient(() => ({ ok: false, status: 500, json: {} }));

    await expect(client.accounts.quickConnect.poll('sec')).rejects.toMatchObject({ status: 500 });
  });

  it('refuses a reply that is not a pairing status', async () => {
    const { client } = pollClient(() => ({ json: { status: 'sideways' } }));

    await expect(client.accounts.quickConnect.poll('sec')).rejects.toThrow();
  });
});
