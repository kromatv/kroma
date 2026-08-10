import { describe, expect, it } from 'vitest';
import { HandoffDevice, PairingStatus } from '../schemas/handoff';
import type { RequestContext } from './base';
import {
  announceHandoff,
  handoffDevices,
  handoffGrant,
  handoffLeave,
  handoffPoll,
} from './handoff';

function recordCtx(reply: unknown = {}) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const ctx = {
    baseUrl: 'http://nas',
    json: async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return reply as never;
    },
  } as unknown as RequestContext;
  return { ctx, calls };
}

const BEACON = {
  handle: 'a1b2c3',
  secret: 's3cr3t',
  check: 'K7QMR',
  confirmRequired: false,
  proof: 'deadbeef',
  instanceId: 'srv-1',
  ttlSecs: 60,
  pollSecs: 3,
};

describe('announceHandoff', () => {
  it('POSTs what the TV says about itself and validates the reply', async () => {
    const { ctx, calls } = recordCtx(BEACON);
    const beacon = await announceHandoff(ctx, {
      deviceId: 'tv-salon-01',
      name: 'Salon',
      platform: 'tvOS',
    });
    expect(beacon).toEqual(BEACON);
    expect(calls[0]?.path).toBe('/handoff/announce');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
      deviceId: 'tv-salon-01',
      name: 'Salon',
      platform: 'tvOS',
    });
  });

  it('retires the beacon it replaces in the same call', () => {
    const { ctx, calls } = recordCtx(BEACON);
    void announceHandoff(ctx, {
      deviceId: 'tv-salon-01',
      name: 'Salon',
      platform: 'tvOS',
      prevSecret: 'old',
    });
    expect(JSON.parse(calls[0]?.init?.body as string).prevSecret).toBe('old');
  });

  it('refuses a reply that is not a beacon', async () => {
    const { ctx } = recordCtx({ handle: 'a1b2c3' });
    await expect(
      announceHandoff(ctx, { deviceId: 'tv-salon-01', name: 'Salon', platform: 'tvOS' }),
    ).rejects.toThrow();
  });

  it('reads a reply that says nothing about confirming as one that needs it', async () => {
    const { confirmRequired: _, ...older } = BEACON;
    const { ctx } = recordCtx(older);
    const beacon = await announceHandoff(ctx, {
      deviceId: 'tv-salon-01',
      name: 'Salon',
      platform: 'tvOS',
    });
    expect(beacon.confirmRequired).toBe(true);
  });
});

describe('handoffLeave', () => {
  it('POSTs the secret in the body, never in the path', async () => {
    const { ctx, calls } = recordCtx();
    await handoffLeave(ctx, 's3cr3t');
    expect(calls[0]?.path).toBe('/handoff/leave');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ secret: 's3cr3t' });
  });
});

describe('handoffPoll', () => {
  it('sends the secret in the body, never in the URL', async () => {
    // A URL is written into every access log the request passes through, and
    // this secret redeems a session plus a 90-day credential.
    const { ctx, calls } = recordCtx({ status: 'pending' });
    await handoffPoll(ctx, 'a b&c=d');
    expect(calls[0]?.path).toBe('/handoff/poll');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ secret: 'a b&c=d' });
  });
});

describe('handoffGrant', () => {
  it('sends the proof when this device heard the TV itself', async () => {
    const { ctx, calls } = recordCtx();
    await handoffGrant(ctx, 'a1b2c3', { proof: 'heard-it' });
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
      handle: 'a1b2c3',
      proof: 'heard-it',
    });
  });

  it('omits it when the server is what told this device about the TV', async () => {
    const { ctx, calls } = recordCtx();
    await handoffGrant(ctx, 'a1b2c3');
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ handle: 'a1b2c3' });
  });

  it('sends the check a person read off the television, with or without a proof', async () => {
    const { ctx, calls } = recordCtx();
    await handoffGrant(ctx, 'a1b2c3', { check: 'K7QMR' });
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
      handle: 'a1b2c3',
      check: 'K7QMR',
    });

    await handoffGrant(ctx, 'a1b2c3', { proof: 'heard-it', check: 'K7QMR' });
    expect(JSON.parse(calls[1]?.init?.body as string)).toEqual({
      handle: 'a1b2c3',
      proof: 'heard-it',
      check: 'K7QMR',
    });
  });
});

describe('handoffDevices / handoffGrant', () => {
  it('lists the waiting TVs and grants one', async () => {
    const row = {
      handle: 'a1b2c3',
      name: 'Salon',
      platform: 'tvOS',
      check: 'K7QMR',
      confirmRequired: false,
    };
    const { ctx, calls } = recordCtx([row]);
    const rows = await handoffDevices(ctx);
    expect(rows).toEqual([row]);
    expect(calls[0]?.path).toBe('/handoff/devices');

    await handoffGrant(ctx, 'a1b2c3');
    expect(calls[1]?.path).toBe('/handoff/grant');
    expect(calls[1]?.init?.method).toBe('POST');
    expect(JSON.parse(calls[1]?.init?.body as string)).toEqual({ handle: 'a1b2c3' });
  });

  it('refuses a row that is missing its handle', async () => {
    const { ctx } = recordCtx([{ name: 'Salon', platform: 'tvOS', check: 'K7QMR' }]);
    await expect(handoffDevices(ctx)).rejects.toThrow();
  });

  it('answers with the parsed rows, so a row that says nothing needs confirming', async () => {
    // The listed rows are what the picker decides on. Handing back the body as
    // it arrived would leave `confirmRequired` undefined on a row from a server
    // that predates it, and undefined is not a "no" - it reads as one.
    const { ctx } = recordCtx([{ handle: 'a1b2c3', name: 'Salon', platform: 'tvOS', check: 'K7' }]);
    const rows = await handoffDevices(ctx);
    expect(rows[0]?.confirmRequired).toBe(true);
  });
});

describe('schemas', () => {
  it('HandoffDevice carries no address', () => {
    const row = HandoffDevice.parse({
      handle: 'a1b2c3',
      name: 'Salon',
      platform: 'tvOS',
      check: 'K7QMR',
      confirmRequired: false,
      ip: '192.168.1.20',
    });
    expect(row).not.toHaveProperty('ip');
  });

  it('HandoffDevice believes the server about confirming, and nobody else', () => {
    const row = { handle: 'a1b2c3', name: 'Salon', platform: 'tvOS', check: 'K7QMR' };
    // Said, and taken at its word: only the server sends this.
    expect(HandoffDevice.parse({ ...row, confirmRequired: false }).confirmRequired).toBe(false);
    // Unsaid, and read as the answer that costs a person five characters rather
    // than the one that hands out an account.
    expect(HandoffDevice.parse(row).confirmRequired).toBe(true);
  });

  it('PairingStatus discriminates on status', () => {
    expect(PairingStatus.parse({ status: 'pending' }).status).toBe('pending');
    expect(PairingStatus.parse({ status: 'expired' }).status).toBe('expired');

    const authorized = PairingStatus.parse({
      status: 'authorized',
      token: 't',
      accessToken: 'a',
      user: {
        id: 'u1',
        email: 'a@b.c',
        username: 'owner',
        permissions: ['playback'],
        createdAt: 'now',
        hasPin: false,
      },
    });
    expect(authorized.status === 'authorized' && authorized.user.username).toBe('owner');
    // An authorized status with no session is not one.
    expect(() => PairingStatus.parse({ status: 'authorized' })).toThrow();
  });
});
