import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { signIn, signInUrl } from './sign-in';

const FIRST_PORT = 47_940;
const blockers: Server[] = [];

const code = JSON.stringify({
  access_token: 'token-123',
  userId: 'user-456',
  inputEmailID: 'owner@example.com',
});

const callbackOf = (url: string) =>
  new URL(url).searchParams.get('redirect_uri') ?? 'the sign-in address named no way back';

const posting = (body: string) => (url: string) => {
  void fetch(callbackOf(url), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
};

function occupy(port: number): Promise<void> {
  const server = createServer();
  blockers.push(server);
  return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
}

afterEach(async () => {
  await Promise.all(blockers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

describe('signInUrl', () => {
  it("asks Samsung's sign-in to send the answer back to this machine", () => {
    expect(signInUrl(4794)).toBe(
      'https://account.samsung.com/mobile/account/check.do?serviceID=v285zxnl3h&actionID=StartOAuth2&accessToken=Y&redirect_uri=http%3A%2F%2Flocalhost%3A4794%2Fsignin%2Fcallback',
    );
  });
});

describe('signIn', () => {
  it('answers what Samsung posts back once the owner has signed in', async () => {
    const body = `code=${encodeURIComponent(code)}`;

    const access = await signIn(posting(body), { firstPort: FIRST_PORT });

    expect(access).toEqual({
      accessToken: 'token-123',
      userId: 'user-456',
      email: 'owner@example.com',
    });
  });

  it('takes an answer that comes back in the address instead', async () => {
    const open = (url: string) => {
      void fetch(`${callbackOf(url)}?code=${encodeURIComponent(code)}`);
    };

    const access = await signIn(open, { firstPort: FIRST_PORT + 20 });

    expect(access.userId).toBe('user-456');
  });

  it('moves to the next port when the first is taken', async () => {
    await occupy(FIRST_PORT + 40);
    const opened: string[] = [];
    const open = (url: string) => {
      opened.push(url);
      posting(`code=${encodeURIComponent(code)}`)(url);
    };

    await signIn(open, { firstPort: FIRST_PORT + 40 });

    expect(callbackOf(opened[0] ?? '')).toBe(`http://localhost:${FIRST_PORT + 41}/signin/callback`);
  });

  it('gives up when every port Samsung would send back to is taken', async () => {
    const first = FIRST_PORT + 140;
    await Promise.all(Array.from({ length: 20 }, (_, index) => occupy(first + index)));

    await expect(signIn(() => {}, { firstPort: first })).rejects.toThrow(
      `no free port from ${first} to ${first + 19} for the sign-in`,
    );
  });

  it('refuses a callback that carries no answer', async () => {
    const signedIn = signIn(posting('state=none'), { firstPort: FIRST_PORT + 60 });

    await expect(signedIn).rejects.toThrow('Samsung sent no sign-in answer back');
  });

  it('refuses a callback far longer than an answer is', async () => {
    const signedIn = signIn(posting(`code=${'x'.repeat(70_000)}`), { firstPort: FIRST_PORT + 80 });

    await expect(signedIn).rejects.toThrow('the sign-in answer is far too long');
  });

  it('ignores a request that is not the way back, and keeps waiting', async () => {
    const open = (url: string) => {
      const back = callbackOf(url);
      void fetch(new URL('/favicon.ico', back)).then(() =>
        posting(`code=${encodeURIComponent(code)}`)(url),
      );
    };

    const access = await signIn(open, { firstPort: FIRST_PORT + 100 });

    expect(access.accessToken).toBe('token-123');
  });

  it('gives up when nobody signs in before the time is out', async () => {
    const signedIn = signIn(() => {}, { firstPort: FIRST_PORT + 120, timeoutMs: 30 });

    await expect(signedIn).rejects.toThrow('nobody signed in to Samsung within five minutes');
  });
});
