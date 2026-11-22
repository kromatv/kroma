import type { KidsProfile, PublicUser, StoredSession } from '@kromatv/client/accounts';
import { UserId } from '@kromatv/client/accounts';
import { describe, expect, it } from 'vitest';
import { kidsDoor, pickerTiles } from './picker-tiles';

const id = (raw: string) => UserId.parse(raw);

function remembered(raw: string, permissions: string[] = []): StoredSession {
  return {
    accessToken: `access-${raw}`,
    user: {
      id: id(raw),
      email: '',
      username: raw,
      createdAt: '',
      hasPin: raw === 'ana',
      permissions,
      libraries: null,
    },
  };
}

const kid = (raw: string): KidsProfile => ({ id: id(raw), username: raw, avatarUrl: null });
const listed = (raw: string): PublicUser => ({
  id: id(raw),
  username: raw,
  avatarUrl: null,
  hasPin: false,
});

describe('the picker tiles', () => {
  it('offers the remembered profiles, then the listed accounts, then the Kids profiles', () => {
    const tiles = pickerTiles({
      accounts: [remembered('ana')],
      profiles: [listed('bo')],
      kids: [kid('leo')],
    });

    expect(tiles.map((t) => [t.id, t.kids, t.locked])).toEqual([
      ['ana', false, true],
      ['bo', false, true],
      ['leo', true, false],
    ]);
  });

  it('offers a Kids profile this device already opened once, with its mark', () => {
    const tiles = pickerTiles({
      accounts: [remembered('ana'), remembered('leo')],
      profiles: [],
      kids: [kid('leo')],
    });

    expect(tiles.map((t) => [t.id, t.kids, t.remembered !== null])).toEqual([
      ['ana', false, true],
      ['leo', true, true],
    ]);
  });
});

describe('the picker’s door to a new Kids profile', () => {
  it('opens through the first member here who manages users', () => {
    const accounts = [
      remembered('ana'),
      remembered('max', ['users.manage']),
      remembered('zoe', ['users.manage']),
    ];

    expect(kidsDoor(accounts)?.user.id).toBe(id('max'));
  });

  it('stays shut while no admin is signed in on the device', () => {
    expect(kidsDoor([remembered('ana'), remembered('ben', ['playback'])])).toBeNull();
  });
});
