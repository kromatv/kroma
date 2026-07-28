// This TV's identity on the cast roster.
//
// The id has one job and two ways to fail at it, both of which are visible to
// every other person in the house rather than to whoever is debugging.
//
// Mint a new one on each launch and the TV appears twice in the phone's picker -
// once live, once a ghost pointing at a receiver that is gone - and "Salon"
// stops meaning what it meant yesterday. Trust a stored value blindly and a
// string hand-edited into the preferences file, or written by an older build
// with a different shape, wedges casting permanently: the server rejects it, and
// nothing re-mints because something IS stored.
//
// It is not a credential. The server binds it to the account that first
// announced it and addresses commands to that account, so this only has to be
// unique and to match the server's shape rule: 8-64 of `[A-Za-z0-9._-]`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const readDeviceValue = vi.hoisted(() => vi.fn((_key: string) => null as string | null));
const writeDeviceValue = vi.hoisted(() => vi.fn((_key: string, _value: string) => {}));
vi.mock('#tv/app/devicePref', () => ({ readDeviceValue, writeDeviceValue }));

import { receiverId, resetReceiverIdCache } from './receiverId';

const KEY = 'kroma:cast-receiver-id';

/** The server's rule, spelled here so a change to either side is a failure. */
const ACCEPTABLE = /^[A-Za-z0-9._-]{8,64}$/;

/** Behave like a real device preference store. */
function persisted() {
  readDeviceValue.mockImplementation((key) => store.get(key) ?? null);
  writeDeviceValue.mockImplementation((key, value) => void store.set(key, value));
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  readDeviceValue.mockReturnValue(null);
  resetReceiverIdCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the first launch', () => {
  it('mints an id and persists it', () => {
    persisted();
    const id = receiverId();
    expect(id).toMatch(ACCEPTABLE);
    expect(writeDeviceValue).toHaveBeenCalledWith(KEY, id);
  });

  it('mints something the server will accept', () => {
    persisted();
    // A clock plus a counter, which every target has - the same reasoning as
    // the playback session ids.
    expect(receiverId()).toMatch(ACCEPTABLE);
  });
});

describe('every launch after the first', () => {
  it('re-announces the SAME receiver', () => {
    persisted();
    store.set(KEY, 'tv-abcdef-0-1234');
    // The phone that named this box "Salon" yesterday has to find it today.
    expect(receiverId()).toBe('tv-abcdef-0-1234');
  });

  it('does not rewrite a value it did not change', () => {
    persisted();
    store.set(KEY, 'tv-abcdef-0-1234');
    receiverId();
    // A write per launch is a write per launch on flash storage, for nothing.
    expect(writeDeviceValue).not.toHaveBeenCalled();
  });

  it('reads the device once and remembers', () => {
    persisted();
    const first = receiverId();
    const second = receiverId();
    expect(second).toBe(first);
    // Announced on every reconnect; going to the preference store each time is
    // needless work on a television.
    expect(readDeviceValue).toHaveBeenCalledOnce();
  });
});

describe('a stored value the server would reject', () => {
  const bad: Array<[string, string]> = [
    ['too short', 'tv-1'],
    ['too long', `tv-${'x'.repeat(70)}`],
    ['a space', 'my tv name'],
    ['a colon', 'tv:salon'],
    ['a slash', 'tv/salon'],
    ['an accent', 'télé-salon'],
    ['empty', ''],
  ];

  for (const [why, value] of bad) {
    it(`re-mints rather than wedging on ${why}`, () => {
      persisted();
      store.set(KEY, value);
      const id = receiverId();
      // The failure this prevents: the server refuses the announce and nothing
      // ever re-mints, because something IS stored. Casting is dead until
      // someone finds the file.
      expect(id).not.toBe(value);
      expect(id).toMatch(ACCEPTABLE);
      expect(writeDeviceValue).toHaveBeenCalledWith(KEY, id);
    });
  }

  it('accepts the full range of characters the rule allows', () => {
    persisted();
    store.set(KEY, 'A.z_0-9.receiver');
    expect(receiverId()).toBe('A.z_0-9.receiver');
  });

  it('accepts a value at each end of the length rule', () => {
    persisted();
    store.set(KEY, 'abcdefgh');
    expect(receiverId()).toBe('abcdefgh');

    resetReceiverIdCache();
    store.set(KEY, 'y'.repeat(64));
    expect(receiverId()).toBe('y'.repeat(64));
  });
});

describe('a device that cannot remember', () => {
  it('still answers with a usable id', () => {
    // readDeviceValue keeps returning null (the default mock): casting should
    // work for this session even if it cannot survive a relaunch.
    expect(receiverId()).toMatch(ACCEPTABLE);
  });
});

describe('minting twice in the same millisecond', () => {
  it('still differs, because the clock alone is not enough', () => {
    // Pin BOTH sources of entropy the id does not control, so the only thing
    // left to tell two ids apart is the in-process counter - which is exactly
    // what it is there for.
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      resetReceiverIdCache();
      ids.add(receiverId());
    }
    expect(ids.size).toBe(5);
    for (const id of ids) expect(id).toMatch(ACCEPTABLE);
  });
});
