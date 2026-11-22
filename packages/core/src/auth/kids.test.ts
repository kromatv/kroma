import { type KidsProfile, type StoredSession, UserId } from '@kromatv/client/accounts';
import { describe, expect, it } from 'vitest';
import { isKidsAccount, KIDS_LEVELS, kidsDoor, kidsDraft, kidsOnDevice, kidsToOffer } from './kids';

const A = 'http://a.lan:4040';
const B = 'https://b.example';

function member(name: string, serverUrl: string, permissions: string[] = []): StoredSession {
  return {
    serverUrl,
    accessToken: `${name}-access`,
    user: {
      id: UserId.parse(name),
      email: '',
      username: name,
      createdAt: '',
      hasPin: false,
      permissions,
      libraries: null,
    },
  };
}

const kid = (name: string): KidsProfile => ({ id: UserId.parse(name), username: name });

const held: Record<string, Record<string, KidsProfile[]>> = {
  [A]: { 'ana-access': [kid('leo'), kid('mia')], 'max-access': [kid('leo'), kid('mia')] },
  [B]: { 'zoe-access': [kid('noah')] },
};

function list(serverUrl: string, access: string): Promise<KidsProfile[]> {
  const answer = held[serverUrl]?.[access];
  return answer ? Promise.resolve(answer) : Promise.reject(new Error('refused'));
}

describe('the Kids profiles a device can open', () => {
  it('lists each server once, with the access of a member there who was answered', async () => {
    const accounts = [member('gone', A), member('ana', A), member('zoe', B)];

    const found = await kidsOnDevice(accounts, list);

    expect(found).toEqual([
      { serverUrl: A, access: 'ana-access', profiles: [kid('leo'), kid('mia')] },
      { serverUrl: B, access: 'zoe-access', profiles: [kid('noah')] },
    ]);
  });

  it('lists nothing for a server no member here is answered on', async () => {
    const found = await kidsOnDevice([member('gone', A)], list);

    expect(found).toEqual([]);
  });

  it('offers only the Kids profiles this device has not remembered yet', async () => {
    const accounts = [member('ana', A), member('leo', A)];
    const found = await kidsOnDevice(accounts, list);

    const offered = kidsToOffer(found, accounts);

    expect(offered.map((choice) => choice.profile.username)).toEqual(['mia']);
    expect(offered[0]).toMatchObject({ serverUrl: A, access: 'ana-access' });
  });

  it('knows a remembered Kids profile by its server, so it can carry the mark', async () => {
    const accounts = [member('ana', A), member('leo', A), member('leo', B)];
    const found = await kidsOnDevice(accounts, list);

    expect(isKidsAccount(found, member('leo', A))).toBe(true);
    expect(isKidsAccount(found, member('leo', B))).toBe(false);
    expect(isKidsAccount(found, member('ana', A))).toBe(false);
  });
});

describe('the picker’s door to a new Kids profile', () => {
  it('opens through the first member here who manages users', () => {
    const accounts = [
      member('ana', A),
      member('max', A, ['users.manage']),
      member('zoe', B, ['users.manage']),
    ];

    expect(kidsDoor(accounts)?.user.id).toBe(UserId.parse('max'));
  });

  it('stays shut while no admin is signed in on the device', () => {
    expect(kidsDoor([member('ana', A), member('ben', A, ['playback'])])).toBeNull();
  });
});

describe('a new Kids profile as a form asks for it', () => {
  it('takes one of the kids levels, youngest first', () => {
    expect(KIDS_LEVELS).toEqual([0, 7, 10]);
  });

  it('is ready once it has a name and a level, and grants every library', () => {
    expect(kidsDraft({ name: '  Léo ', level: 7 })).toEqual({
      username: 'Léo',
      level: 7,
      libraries: null,
    });
  });

  it('is not ready without a name or without a level', () => {
    expect(kidsDraft({ name: '   ', level: 0 })).toBeNull();
    expect(kidsDraft({ name: 'Léo', level: null })).toBeNull();
  });
});
