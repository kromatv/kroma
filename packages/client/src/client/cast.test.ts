import { describe, expect, it } from 'vitest';
import { CastReceiver, type CastAnnounceBody } from '../schemas/cast';
import type { RequestContext } from './base';
import { announceCast, castReceivers, sendCastCommand, unregisterCast } from './cast';

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

const beat: CastAnnounceBody = {
  receiverId: 'tv-salon-01',
  name: 'Salon',
  platform: 'Apple TV',
  lastAppliedSeq: 4,
};

describe('announceCast', () => {
  it('POSTs the heartbeat with its ack', () => {
    const { ctx, calls } = recordCtx();
    void announceCast(ctx, beat);
    expect(calls[0]?.path).toBe('/cast/announce');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual(beat);
  });

  it('carries what the receiver is playing when it is playing', () => {
    const { ctx, calls } = recordCtx();
    void announceCast(ctx, {
      ...beat,
      playback: { itemId: 'it1', positionMs: 12_000, state: 'playing' },
    });
    expect(JSON.parse(calls[0]?.init?.body as string).playback).toEqual({
      itemId: 'it1',
      positionMs: 12_000,
      state: 'playing',
    });
  });
});

describe('sendCastCommand', () => {
  it('POSTs the command flat and returns its seq', async () => {
    const { ctx, calls } = recordCtx({ seq: 7 });
    const seq = await sendCastCommand(ctx, 'tv-salon-01', {
      type: 'play',
      itemId: 'it1' as never,
      positionMs: 5000,
    });
    expect(seq).toBe(7);
    expect(calls[0]?.path).toBe('/cast/receivers/tv-salon-01/command');
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
      type: 'play',
      itemId: 'it1',
      positionMs: 5000,
    });
  });

  it('escapes the receiver id in the path', () => {
    const { ctx, calls } = recordCtx({ seq: 1 });
    void sendCastCommand(ctx, 'tv/../salon', { type: 'pause' });
    expect(calls[0]?.path).toBe('/cast/receivers/tv%2F..%2Fsalon/command');
  });
});

describe('castReceivers / unregisterCast', () => {
  it('lists and unregisters', () => {
    const { ctx, calls } = recordCtx([]);
    void castReceivers(ctx);
    void unregisterCast(ctx, 'tv-salon-01');
    expect(calls[0]?.path).toBe('/cast/receivers');
    expect(calls[1]).toEqual({
      path: '/cast/receivers/tv-salon-01',
      init: { method: 'DELETE' },
    });
  });
});

describe('CastReceiver schema', () => {
  it('parses a row and keeps unknown enum values usable', () => {
    const row = CastReceiver.parse({
      id: 'tv-salon-01',
      name: 'Salon',
      platform: 'Apple TV',
      mine: false,
      username: 'Salon',
      // A value this build doesn't know must not throw away the whole row: the
      // TV is still there and still controllable.
      network: 'MOON',
    });
    expect(row.network).toBe('WAN');
    expect(row.nowPlaying).toBeUndefined();
  });
});
