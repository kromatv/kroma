// A device id must match the server's shape rule: 8-64 of `[A-Za-z0-9._-]`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const readDeviceValue = vi.hoisted(() => vi.fn((_key: string) => null as string | null));
const writeDeviceValue = vi.hoisted(() => vi.fn((_key: string, _value: string) => {}));
vi.mock('#tv/app/devicePref', () => ({ readDeviceValue, writeDeviceValue }));

import { createDeviceIdentity } from './device';

const KEY = 'kroma:cast-receiver-id';

// The server's rule, spelled here so a change to either side is a failure.
const ACCEPTABLE = /^[A-Za-z0-9._-]{8,64}$/;

function persisted() {
  readDeviceValue.mockImplementation((key) => store.get(key) ?? null);
  writeDeviceValue.mockImplementation((key, value) => void store.set(key, value));
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  readDeviceValue.mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the first launch', () => {
  it('mints an id and persists it', () => {
    const deviceId = createDeviceIdentity();
    persisted();
    const id = deviceId();
    expect(id).toMatch(ACCEPTABLE);
    expect(writeDeviceValue).toHaveBeenCalledWith(KEY, id);
  });

  it('mints something the server will accept', () => {
    const deviceId = createDeviceIdentity();
    persisted();
    expect(deviceId()).toMatch(ACCEPTABLE);
  });
});

describe('every launch after the first', () => {
  it('re-announces the SAME receiver', () => {
    const deviceId = createDeviceIdentity();
    persisted();
    store.set(KEY, 'tv-abcdef-0-1234');
    expect(deviceId()).toBe('tv-abcdef-0-1234');
  });

  it('does not rewrite a value it did not change', () => {
    const deviceId = createDeviceIdentity();
    persisted();
    store.set(KEY, 'tv-abcdef-0-1234');
    deviceId();
    expect(writeDeviceValue).not.toHaveBeenCalled();
  });

  it('reads the device once and remembers', () => {
    const deviceId = createDeviceIdentity();
    persisted();
    const first = deviceId();
    const second = deviceId();
    expect(second).toBe(first);
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
      const deviceId = createDeviceIdentity();
      persisted();
      store.set(KEY, value);
      const id = deviceId();
      expect(id).not.toBe(value);
      expect(id).toMatch(ACCEPTABLE);
      expect(writeDeviceValue).toHaveBeenCalledWith(KEY, id);
    });
  }

  it('accepts the full range of characters the rule allows', () => {
    const deviceId = createDeviceIdentity();
    persisted();
    store.set(KEY, 'A.z_0-9.receiver');
    expect(deviceId()).toBe('A.z_0-9.receiver');
  });

  it('accepts a value at each end of the length rule', () => {
    const deviceId = createDeviceIdentity();
    persisted();
    store.set(KEY, 'abcdefgh');
    expect(deviceId()).toBe('abcdefgh');

    store.set(KEY, 'y'.repeat(64));
    expect(createDeviceIdentity()()).toBe('y'.repeat(64));
  });
});

describe('a device that cannot remember', () => {
  it('still answers with a usable id', () => {
    const deviceId = createDeviceIdentity();
    expect(deviceId()).toMatch(ACCEPTABLE);
  });
});

describe('minting twice in the same millisecond', () => {
  it('still differs, because the clock alone is not enough', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      ids.add(createDeviceIdentity()());
    }
    expect(ids.size).toBe(5);
    for (const id of ids) expect(id).toMatch(ACCEPTABLE);
  });
});

it('keeps each root identity stable when a different device store is read', () => {
  persisted();
  const a = createDeviceIdentity();
  const b = createDeviceIdentity();
  store.set(KEY, 'device-A');
  expect(a()).toBe('device-A');
  store.set(KEY, 'device-B');
  expect(b()).toBe('device-B');
  expect(a()).toBe('device-A');
});
it('mints accepted identifiers where the platform has no crypto API', () => {
  vi.stubGlobal('crypto', undefined);
  try {
    expect(createDeviceIdentity()()).toMatch(ACCEPTABLE);
  } finally {
    vi.unstubAllGlobals();
  }
});
