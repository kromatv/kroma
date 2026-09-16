import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openGrant, openPending, sealPending } from './consent';
import worker from './index';
import { ADDRESS, deny, FAR, get, ORIGIN, post, SECRET, testEnv } from './test-support';

vi.mock('./logo', () => ({ LOGO_PNG: new ArrayBuffer(4) }));

let env: ReturnType<typeof testEnv>;

beforeEach(() => {
  env = testEnv();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ENROL = {
  address: ADDRESS,
  origin: ORIGIN,
  serverName: 'Home',
  locale: 'fr',
  token: 'tok-1234567890',
};

const confirmPath = (url: string) => new URL(url).pathname;

describe('asking a mailbox', () => {
  it('sends one fixed consent email whose only link is the relay’s own', async () => {
    const res = await worker.fetch(post('/v1/enrol', ENROL), env);

    expect(res.status).toBe(204);
    const [sent] = env.sent;
    expect(sent?.to).toBe(ADDRESS);
    expect(sent?.from).toEqual({ email: 'no-reply@kroma.tv', name: 'KROMA' });
    expect(sent?.subject).toContain('Home');
    expect(sent?.text).toContain('kroma.example');
    expect(sent?.text).not.toContain(ORIGIN);
    expect(sent?.text).toMatch(/https:\/\/mail\.kroma\.tv\/confirm\/v1\./);
    expect(sent?.attachments[0]?.contentId).toBe('logo');
  });

  it('bakes the server’s token and the recipient’s language into the link', async () => {
    await worker.fetch(post('/v1/enrol', ENROL), env);
    const url = env.sent[0]?.text.match(/https:\/\/mail\.kroma\.tv\/confirm\/(\S+)/)?.[1] ?? '';

    const pending = await openPending(SECRET, url, Math.floor(Date.now() / 1000));
    expect(pending).toMatchObject({ a: ADDRESS, o: ORIGIN, n: 'Home', l: 'fr', t: ENROL.token });
  });

  it('gives a mailbox a small daily budget of consent requests', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await worker.fetch(post('/v1/enrol', ENROL), env)).status).toBe(204);
    }

    const res = await worker.fetch(post('/v1/enrol', { ...ENROL, serverName: 'Other' }), env);
    expect(res.status).toBe(429);
    expect(env.sent).toHaveLength(3);
  });

  it('shares that budget across spellings of one address', async () => {
    for (const address of [ADDRESS, ADDRESS.toUpperCase(), ` ${ADDRESS} `]) {
      expect((await worker.fetch(post('/v1/enrol', { ...ENROL, address }), env)).status).toBe(204);
    }

    expect((await worker.fetch(post('/v1/enrol', ENROL), env)).status).toBe(429);
  });

  it('rate-limits the caller, before anything is sent', async () => {
    env.ENROL_IP = deny();

    expect((await worker.fetch(post('/v1/enrol', ENROL), env)).status).toBe(429);
    expect(env.sent).toHaveLength(0);
  });

  it('refuses a public http origin, a bad address, and an oversized body', async () => {
    for (const body of [
      { ...ENROL, origin: 'http://kroma.example' },
      { ...ENROL, address: 'nobody' },
      { ...ENROL, origin: 'https://kroma.example/admin' },
    ]) {
      expect((await worker.fetch(post('/v1/enrol', body), env)).status).toBe(400);
    }
    const big = post('/v1/enrol', ENROL, { 'content-length': '99999' });
    expect((await worker.fetch(big, env)).status).toBe(413);
    expect(env.sent).toHaveLength(0);
  });

  it('refuses a body whose length it was not told', async () => {
    const chunked = new Request('https://mail.kroma.tv/v1/enrol', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ENROL),
    });

    expect((await worker.fetch(chunked, env)).status).toBe(411);
    expect(env.sent).toHaveLength(0);
  });

  it('says so when the mail service is not bound, and reports its failures', async () => {
    env.EMAIL = undefined;
    expect((await worker.fetch(post('/v1/enrol', ENROL), env)).status).toBe(503);

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    env.EMAIL = { send: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'E_X' })) };
    expect((await worker.fetch(post('/v1/enrol', ENROL), env)).status).toBe(502);
  });
});

describe('the consent page', () => {
  async function blob(overrides: Partial<Parameters<typeof sealPending>[1]> = {}) {
    return sealPending(SECRET, {
      a: ADDRESS,
      o: ORIGIN,
      n: 'Home <b>',
      l: 'fr',
      t: 'tok-1234567890',
      e: FAR,
      ...overrides,
    });
  }

  it('shows who is asking and consents on the post only', async () => {
    const path = `/confirm/${await blob()}`;

    const page = await worker.fetch(get(path), env);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Home &lt;b&gt;');
    expect(html).toContain('kroma.example');
    expect(html).toContain(`action="${path}"`);
    expect(env.sent).toHaveLength(0);
  });

  it('hands the grant back to the server through the browser', async () => {
    const path = `/confirm/${await blob()}`;

    const res = await worker.fetch(
      new Request(`https://mail.kroma.tv${path}`, { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(303);
    const target = new URL(res.headers.get('location') ?? '');
    expect(target.origin).toBe(ORIGIN);
    expect(target.pathname).toBe('/verify-email');
    expect(target.searchParams.get('token')).toBe('tok-1234567890');
    const grant = await openGrant(SECRET, target.searchParams.get('grant') ?? '', 0);
    expect(grant).toMatchObject({ a: ADDRESS, o: ORIGIN });
  });

  it('is a dead end for junk, an expired request, and a grant used as a request', async () => {
    const expired = await blob({ e: 1 });
    for (const bad of ['v1.junk', expired, 'nothing']) {
      expect((await worker.fetch(get(`/confirm/${bad}`), env)).status).toBe(404);
      const res = await worker.fetch(
        new Request(`https://mail.kroma.tv/confirm/${bad}`, { method: 'POST' }),
        env,
      );
      expect(res.status).toBe(404);
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('keeps the page path stable so the form posts back to itself', async () => {
    const path = `/confirm/${await blob()}`;

    expect(confirmPath(`https://mail.kroma.tv${path}`)).toBe(path);
  });
});
