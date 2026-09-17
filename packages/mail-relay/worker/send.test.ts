import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Consents, consentUrl } from './consent';
import worker from './index';
import {
  ADDRESS,
  consented,
  deny,
  get,
  ORIGIN,
  PUBLIC_URL,
  pendingFor,
  post,
  registered,
  type Server,
  signed,
  testEnv,
} from './test-support';

let env: ReturnType<typeof testEnv>;
let server: Server;

beforeEach(async () => {
  env = testEnv();
  server = await registered();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const MESSAGE = {
  to: ADDRESS,
  subject: 'Reset your password · Home',
  text: `Open ${ORIGIN}/reset?token=abc to choose a new one.`,
  html: `<html><body><img src="cid:logo"><a href="${ORIGIN}/reset?token=abc">Choose</a></body></html>`,
  attachments: [
    { filename: 'logo.png', type: 'image/png', contentId: 'logo', content: 'iVBORw0KGgo' },
  ],
};

const send = async (payload: Record<string, unknown>, by = server) =>
  worker.fetch(post('/v1/send', await signed(by, payload)), env);

describe('sending to a mailbox that said yes', () => {
  beforeEach(() => consented(env));

  it('delivers the server’s message, from the relay, under the server’s real host', async () => {
    const res = await send(MESSAGE);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivered: true });
    const [sent] = env.sent;
    expect(sent?.to).toBe(ADDRESS);
    expect(sent?.from).toEqual({ email: 'no-reply@kroma.tv', name: 'kroma.example via KROMA' });
    expect(sent?.html).toBe(MESSAGE.html);
    expect(sent?.attachments[0]).toMatchObject({
      contentId: 'logo',
      disposition: 'inline',
      type: 'image/png',
    });
    expect(sent?.attachments[0]?.content.byteLength).toBe(8);
  });

  it('refuses a message whose links lead away from the origin', async () => {
    const res = await send({
      ...MESSAGE,
      html: MESSAGE.html.replace(ORIGIN, 'https://evil.example'),
    });

    expect(res.status).toBe(422);
    expect(env.sent).toHaveLength(0);
  });

  it('is a yes for this origin only', async () => {
    const other = await registered('https://other.example');

    expect((await send(MESSAGE, other)).status).toBe(403);
  });

  it('withdraws the yes when the mailbox bounces, and reports a wobble as transient', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = (code: string) => ({
      send: vi.fn().mockRejectedValue(Object.assign(new Error(code), { code })),
    });

    env.EMAIL = failing('E_DELIVERY_FAILED');
    expect((await send(MESSAGE)).status).toBe(502);
    expect(await new Consents(env.COUNTERS, env.LIMIT_SECRET).has(ORIGIN, ADDRESS)).toBe(true);
    env.EMAIL = failing('E_RECIPIENT_SUPPRESSED');
    expect((await send(MESSAGE)).status).toBe(410);
    expect(await new Consents(env.COUNTERS, env.LIMIT_SECRET).has(ORIGIN, ADDRESS)).toBe(false);
  });

  it('rate-limits by mailbox and by caller, and keeps a daily budget per mailbox', async () => {
    env.SEND_ADDR = deny();
    expect((await send(MESSAGE)).status).toBe(429);
    env.SEND_ADDR = testEnv().SEND_ADDR;
    env.SEND_IP = deny();
    expect((await send(MESSAGE)).status).toBe(429);
    env.SEND_IP = testEnv().SEND_IP;

    for (let i = 0; i < 50; i++) expect((await send(MESSAGE)).status).toBe(200);
    expect((await send(MESSAGE)).status).toBe(429);
    expect(env.sent).toHaveLength(50);
  });
});

describe('sending to a mailbox that has not said yes', () => {
  it('is refused, however harmless the message', async () => {
    const res = await send(MESSAGE);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'consent required' });
    expect(env.sent).toHaveLength(0);
  });

  it('is allowed for the question itself: a message whose only link is that mailbox’s consent link', async () => {
    const link = consentUrl(PUBLIC_URL, await pendingFor());
    const question = {
      to: ADDRESS,
      subject: 'Home would like to send you email',
      text: `Open ${link} to allow it.`,
      html: `<a href="${link}">Allow</a><div>${link}</div>`,
    };

    const res = await send(question);
    expect(res.status).toBe(200);
    expect(env.sent[0]?.to).toBe(ADDRESS);
    expect(await new Consents(env.COUNTERS, env.LIMIT_SECRET).has(ORIGIN, ADDRESS)).toBe(false);
  });

  it('draws questions on a budget of their own, so they can never starve deliveries', async () => {
    const day = Math.floor(Date.now() / 1000 / 86400);
    env.COUNTERS.store.set(`ask:${day}`, '500');
    const link = consentUrl(PUBLIC_URL, await pendingFor());
    const question = { to: ADDRESS, subject: 'x', text: `Open ${link}`, html: '<p>x</p>' };

    expect((await send(question)).status).toBe(429);
    await consented(env);
    expect((await send(MESSAGE)).status).toBe(200);
  });

  it('refuses the question when it carries any other link, or a link for another mailbox or origin', async () => {
    const link = consentUrl(PUBLIC_URL, await pendingFor());
    const withOrigin = {
      to: ADDRESS,
      subject: 'x',
      text: `${link} and ${ORIGIN}/x`,
      html: '<p>x</p>',
    };
    expect((await send(withOrigin)).status).toBe(422);

    const someoneElse = consentUrl(PUBLIC_URL, await pendingFor('other@example.test'));
    expect(
      (await send({ to: ADDRESS, subject: 'x', text: someoneElse, html: '<p>x</p>' })).status,
    ).toBe(403);

    const otherOrigin = consentUrl(PUBLIC_URL, await pendingFor(ADDRESS, 'https://other.example'));
    expect(
      (await send({ to: ADDRESS, subject: 'x', text: otherOrigin, html: '<p>x</p>' })).status,
    ).toBe(403);
    expect(env.sent).toHaveLength(0);
  });
});

describe('the request surface', () => {
  it('refuses a forged, foreign or stale request with one answer each', async () => {
    const good = await signed(server, MESSAGE);

    expect(
      (await worker.fetch(post('/v1/send', { ...good, signature: 'x'.repeat(86) }), env)).status,
    ).toBe(401);
    const other = await registered();
    expect(
      (await worker.fetch(post('/v1/send', { ...good, instance: other.instance }), env)).status,
    ).toBe(401);
    expect((await send({ ...MESSAGE, ts: 1 })).status).toBe(400);
    expect(env.sent).toHaveLength(0);
  });

  it('validates the message rather than forwarding whatever it is given', async () => {
    await consented(env);
    for (const body of [
      { to: ADDRESS },
      { to: 'nobody', subject: 'x', text: 'y', html: 'z' },
      { to: ADDRESS, subject: '', text: 'y', html: 'z' },
      { to: ADDRESS, subject: 'x', text: 'y', html: 'z'.repeat(65 * 1024) },
      {
        ...MESSAGE,
        attachments: [{ filename: '../x', type: 'image/png', contentId: 'logo', content: 'AAAA' }],
      },
      {
        ...MESSAGE,
        attachments: [
          { filename: 'x.exe', type: 'application/x-msdownload', contentId: 'x', content: 'AAAA' },
        ],
      },
    ]) {
      expect((await send(body)).status).toBe(400);
    }
    expect(env.sent).toHaveLength(0);
  });

  it('answers /health, offers nothing else, and answers failures as JSON saying nothing', async () => {
    expect(await (await worker.fetch(get('/health'), env)).json()).toEqual({
      ok: true,
      email: true,
    });
    expect((await worker.fetch(post('/v1/anything', {}), env)).status).toBe(404);
    expect((await worker.fetch(get('/v1/send'), env)).status).toBe(404);

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    env.SEND_IP = { limit: vi.fn().mockRejectedValue(new Error('down')) };
    const res = await send(MESSAGE);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
  });

  it('refuses a body whose length it was not told, and one too large to be ours', async () => {
    const chunked = new Request(`${PUBLIC_URL}/v1/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect((await worker.fetch(chunked, env)).status).toBe(411);
    expect(
      (await worker.fetch(post('/v1/send', {}, { 'content-length': '9999999' }), env)).status,
    ).toBe(413);
  });
});
