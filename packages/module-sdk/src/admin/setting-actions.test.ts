import type { KromaClient } from '@kromatv/client';
import { describe, expect, it, vi } from 'vitest';
import { ACTIONS } from './setting-actions';

const reply = { sentTo: 'a@b.c' };

function clientWith(admin: object): KromaClient {
  return { admin } as unknown as KromaClient;
}

describe('ACTIONS', () => {
  it('runs the smtp test through the admin client', async () => {
    const testSmtp = vi.fn().mockResolvedValue(reply);

    const result = await ACTIONS.smtpTest?.run(clientWith({ testSmtp }));

    expect(testSmtp).toHaveBeenCalledOnce();
    expect(result).toBe(reply);
  });

  it('runs the relay test through the admin client', async () => {
    const testRelay = vi.fn().mockResolvedValue(reply);

    const result = await ACTIONS.relayTest?.run(clientWith({ testRelay }));

    expect(testRelay).toHaveBeenCalledOnce();
    expect(result).toBe(reply);
  });

  it('names the recipient in the smtp success text', () => {
    const t = vi.fn((key: string, vars?: object) => `${key}:${JSON.stringify(vars)}`);

    const text = ACTIONS.smtpTest?.ok(t as never, reply);

    expect(text).toBe('admin.smtpTestOk:{"email":"a@b.c"}');
  });

  it('picks the asked relay text when the owner was asked', () => {
    const t = vi.fn((key: string) => key);

    const asked = ACTIONS.relayTest?.ok(t as never, { ...reply, asked: true });
    const done = ACTIONS.relayTest?.ok(t as never, reply);

    expect(asked).toBe('admin.relayTestAsked');
    expect(done).toBe('admin.relayTestOk');
  });
});
