import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openGrant, sealGrant, sealPending } from './consent';
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

const grantFor = (a = ADDRESS, o = ORIGIN, e = FAR) => sealGrant(SECRET, { a, o, e });

const MESSAGE = {
  subject: 'Reset your password · Home',
  text: `Open ${ORIGIN}/reset?token=abc to choose a new one.`,
  html: `<html><body><img src="cid:logo"><a href="${ORIGIN}/reset?token=abc">Choose</a></body></html>`,
};

describe('spending a grant', () => {
  it('delivers to the mailbox the grant names, from the relay, and to no other', async () => {
    const res = await worker.fetch(post('/v1/send', { grant: await grantFor(), ...MESSAGE }), env);

    expect(res.status).toBe(200);
    const [sent] = env.sent;
    expect(sent?.to).toBe(ADDRESS);
    expect(sent?.from.email).toBe('no-reply@kroma.tv');
    expect(sent?.subject).toBe(MESSAGE.subject);
    expect(sent?.html).toBe(MESSAGE.html);
    expect(sent?.attachments[0]).toMatchObject({ contentId: 'logo', disposition: 'inline' });
  });

  it('hands back a renewed grant for the same mailbox and server', async () => {
    const now = Math.floor(Date.now() / 1000);
    const nearlyOut = await grantFor(ADDRESS, ORIGIN, now + 60);

    const res = await worker.fetch(post('/v1/send', { grant: nearlyOut, ...MESSAGE }), env);
    const { delivered, grant } = (await res.json()) as { delivered: boolean; grant: string };

    expect(delivered).toBe(true);
    const renewed = await openGrant(SECRET, grant, now);
    expect(renewed).toMatchObject({ a: ADDRESS, o: ORIGIN });
    expect(renewed?.e).toBeGreaterThan(now + 300 * 24 * 3600);
  });

  it('refuses a forged, expired, foreign or pending blob with one answer', async () => {
    const pending = await sealPending(SECRET, {
      a: ADDRESS,
      o: ORIGIN,
      n: 'Home',
      l: 'en',
      t: 'tok-1234567890',
      e: FAR,
    });
    for (const grant of [
      await sealGrant('another-secret', { a: ADDRESS, o: ORIGIN, e: FAR }),
      await grantFor(ADDRESS, ORIGIN, 1),
      pending,
      'v1.garbage',
    ]) {
      const res = await worker.fetch(post('/v1/send', { grant, ...MESSAGE }), env);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid grant' });
    }
    expect(env.sent).toHaveLength(0);
  });

  it('refuses a message whose links lead away from the consented server', async () => {
    const grant = await grantFor();
    const offOrigin = { ...MESSAGE, html: MESSAGE.html.replace(ORIGIN, 'https://evil.example') };

    const res = await worker.fetch(post('/v1/send', { grant, ...offOrigin }), env);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toMatch(/leads off/);
    expect(env.sent).toHaveLength(0);
  });

  it('pins links to the origin the grant carries, not one the request could name', async () => {
    const grant = await grantFor(ADDRESS, 'https://other.example');

    const res = await worker.fetch(post('/v1/send', { grant, ...MESSAGE }), env);
    expect(res.status).toBe(422);
  });

  it('rate-limits by mailbox and by caller, and keeps a daily budget per mailbox', async () => {
    const grant = await grantFor();
    env.SEND_ADDR = deny();
    expect((await worker.fetch(post('/v1/send', { grant, ...MESSAGE }), env)).status).toBe(429);

    env.SEND_ADDR = testEnv().SEND_ADDR;
    env.SEND_IP = deny();
    expect((await worker.fetch(post('/v1/send', { grant, ...MESSAGE }), env)).status).toBe(429);

    env.SEND_IP = testEnv().SEND_IP;
    for (let i = 0; i < 50; i++) {
      expect((await worker.fetch(post('/v1/send', { grant, ...MESSAGE }), env)).status).toBe(200);
    }
    expect((await worker.fetch(post('/v1/send', { grant, ...MESSAGE }), env)).status).toBe(429);
    expect(env.sent).toHaveLength(50);
  });

  it('turns a suppressed mailbox into 410 and a wobble into 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const grant = await grantFor();
    const failing = (code: string) => ({
      send: vi.fn().mockRejectedValue(Object.assign(new Error(code), { code })),
    });

    env.EMAIL = failing('E_RECIPIENT_SUPPRESSED');
    expect((await worker.fetch(post('/v1/send', { grant, ...MESSAGE }), env)).status).toBe(410);
    env.EMAIL = failing('E_DAILY_LIMIT_EXCEEDED');
    expect((await worker.fetch(post('/v1/send', { grant, ...MESSAGE }), env)).status).toBe(429);
    env.EMAIL = failing('E_DELIVERY_FAILED');
    expect((await worker.fetch(post('/v1/send', { grant, ...MESSAGE }), env)).status).toBe(502);
  });

  it('validates the message rather than forwarding whatever it is given', async () => {
    const grant = await grantFor();
    for (const body of [
      { grant },
      { grant, subject: 'x', text: 'y' },
      { grant, subject: '', text: 'y', html: 'z' },
      { grant, subject: 'x', text: 'y', html: 'z'.repeat(65 * 1024) },
    ]) {
      expect((await worker.fetch(post('/v1/send', body), env)).status).toBe(400);
    }
    expect(env.sent).toHaveLength(0);
  });
});

describe('the request surface', () => {
  it('answers /health with whether mail is armed', async () => {
    expect(await (await worker.fetch(get('/health'), env)).json()).toEqual({
      ok: true,
      email: true,
    });
  });

  it('offers nothing else, and answers failures as JSON saying nothing', async () => {
    expect((await worker.fetch(post('/v1/anything', {}), env)).status).toBe(404);
    expect((await worker.fetch(get('/v1/send'), env)).status).toBe(404);

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    env.SEND_IP = { limit: vi.fn().mockRejectedValue(new Error('down')) };
    const res = await worker.fetch(post('/v1/send', { grant: await grantFor(), ...MESSAGE }), env);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
  });

  it('names the offending field rather than echoing the request back', async () => {
    const res = await worker.fetch(post('/v1/send', { grant: 42 }), env);

    expect(res.status).toBe(400);
    const { error } = (await res.json()) as { error: string };
    expect(error).toContain('grant');
    expect(error).not.toContain('42');
  });
});
