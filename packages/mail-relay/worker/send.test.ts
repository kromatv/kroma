import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activationUrl, openBlock } from './activation';
import worker from './index';
import {
  ADDRESS,
  activated,
  deny,
  get,
  marks,
  ORIGIN,
  OWNER,
  PUBLIC_URL,
  pendingFor,
  post,
  registered,
  SECRET,
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

describe('sending from an activated server', () => {
  beforeEach(() => activated(env));

  it('delivers the server’s message to any mailbox, from the relay, under the server’s real host', async () => {
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
    expect((await send({ ...MESSAGE, to: 'someone-else@example.test' })).status).toBe(200);
  });

  it('carries the relay’s own opt-out link for that mailbox and that server', async () => {
    await send(MESSAGE);

    const headers = env.sent[0]?.headers ?? {};
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const link = /^<(.+)>$/.exec(headers['List-Unsubscribe'] ?? '')?.[1] ?? '';
    expect(link.startsWith(`${PUBLIC_URL}/block/`)).toBe(true);
    const blob = link.slice(`${PUBLIC_URL}/block/`.length);
    expect(await openBlock(SECRET, blob, Math.floor(Date.now() / 1000))).toMatchObject({
      a: ADDRESS,
      o: ORIGIN,
    });
  });

  it('leaves the activation with the owner: a member’s opt-out closes their mailbox, not the server', async () => {
    await send(MESSAGE);
    await marks(env).block(ORIGIN, ADDRESS);
    await marks(env).deactivateBy(ORIGIN, ADDRESS);

    expect(await marks(env).active(ORIGIN)).toBe(true);
    expect((await send(MESSAGE)).status).toBe(410);
    expect((await send({ ...MESSAGE, to: OWNER })).status).toBe(200);
  });

  it('carries nothing to a mailbox that opted out of this server', async () => {
    await marks(env).block(ORIGIN, ADDRESS);

    const res = await send(MESSAGE);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'address opted out' });
    expect((await send({ ...MESSAGE, to: 'someone-else@example.test' })).status).toBe(200);
  });

  it('refuses a message whose links lead away from the origin', async () => {
    const res = await send({
      ...MESSAGE,
      html: MESSAGE.html.replace(ORIGIN, 'https://evil.example'),
    });

    expect(res.status).toBe(422);
    expect(env.sent).toHaveLength(0);
  });

  it('is an activation for this origin only', async () => {
    const other = await registered('https://other.example');

    expect((await send(MESSAGE, other)).status).toBe(403);
  });

  it('blocks a mailbox that bounces, and reports a wobble as transient', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = (code: string) => ({
      send: vi.fn().mockRejectedValue(Object.assign(new Error(code), { code })),
    });

    env.EMAIL = failing('E_DELIVERY_FAILED');
    expect((await send(MESSAGE)).status).toBe(502);
    expect(await marks(env).blocked(ORIGIN, ADDRESS)).toBe(false);
    env.EMAIL = failing('E_RECIPIENT_SUPPRESSED');
    expect((await send(MESSAGE)).status).toBe(410);
    expect(await marks(env).blocked(ORIGIN, ADDRESS)).toBe(true);
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

  it('keeps a daily budget per origin, so one server cannot spend the relay’s day', async () => {
    for (let i = 0; i < 200; i++) {
      expect((await send({ ...MESSAGE, to: `r${i % 40}@example.test` })).status).toBe(200);
    }

    expect((await send({ ...MESSAGE, to: 'r41@example.test' })).status).toBe(429);
    const other = await registered('https://other.example');
    await activated(env, 'https://other.example');
    const theirs = {
      to: 'r41@example.test',
      subject: 'x',
      text: 'https://other.example/x',
      html: '<p>x</p>',
    };
    expect((await send(theirs, other)).status).toBe(200);
  });
});

describe('sending from a server nobody activated', () => {
  it('is refused, however harmless the message', async () => {
    const res = await send(MESSAGE);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'activation required' });
    expect(env.sent).toHaveLength(0);
  });

  it('is allowed for the question itself: to the owner, with that owner’s activation link as its only link', async () => {
    const link = activationUrl(PUBLIC_URL, await pendingFor());
    const question = {
      to: OWNER,
      subject: 'Allow Home to send email through KROMA?',
      text: `Open ${link} to allow it.`,
      html: `<a href="${link}">Allow</a><div>${link}</div>`,
    };

    const res = await send(question);
    expect(res.status).toBe(200);
    expect(env.sent[0]?.to).toBe(OWNER);
    expect(env.sent[0]?.headers).toBeUndefined();
    expect(await marks(env).active(ORIGIN)).toBe(false);
  });

  it('draws questions on a budget of their own, so they can never starve deliveries', async () => {
    const day = Math.floor(Date.now() / 1000 / 86400);
    env.COUNTERS.store.set(`ask:${day}`, '500');
    const link = activationUrl(PUBLIC_URL, await pendingFor());
    const question = { to: OWNER, subject: 'x', text: `Open ${link}`, html: '<p>x</p>' };

    expect((await send(question)).status).toBe(429);
    await activated(env);
    expect((await send(MESSAGE)).status).toBe(200);
  });

  it('refuses the question when it carries any other link, or a link for another mailbox or origin', async () => {
    const link = activationUrl(PUBLIC_URL, await pendingFor());
    const withOrigin = {
      to: OWNER,
      subject: 'x',
      text: `${link} and ${ORIGIN}/x`,
      html: '<p>x</p>',
    };
    expect((await send(withOrigin)).status).toBe(422);

    const someoneElse = activationUrl(PUBLIC_URL, await pendingFor('other@example.test'));
    expect(
      (await send({ to: OWNER, subject: 'x', text: someoneElse, html: '<p>x</p>' })).status,
    ).toBe(403);

    const otherOrigin = activationUrl(PUBLIC_URL, await pendingFor(OWNER, 'https://other.example'));
    expect(
      (await send({ to: OWNER, subject: 'x', text: otherOrigin, html: '<p>x</p>' })).status,
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
    await activated(env);
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
