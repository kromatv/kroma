// Device persistence for the phone client. Most of this is JSON in and out of
// SecureStore; the exception is the pair of biometric gates, which must both
// fail closed when a keychain read cannot say whether a profile is locked.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const unreadable = new Set<string>();
const unwritable = new Set<string>();

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => {
    if (unreadable.has(key)) throw new Error('keychain locked');
    return store.get(key) ?? null;
  }),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    if (unwritable.has(key)) throw new Error('no biometrics enrolled');
    store.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => void store.delete(key)),
  canUseBiometricAuthentication: vi.fn(() => true),
}));

import * as SecureStore from 'expo-secure-store';
import {
  canStoreBiometricPin,
  isBiometricLockEnabled,
  isBiometricUnlockEnabled,
  loadAccounts,
  loadActive,
  loadPref,
  loadServers,
  type MobileAccount,
  passBiometricLock,
  readPinBehindBiometrics,
  saveAccounts,
  saveActive,
  savePinBehindBiometrics,
  savePref,
  saveServers,
  setBiometricLockEnabled,
  setBiometricUnlockEnabled,
} from './storage';

const ACCOUNTS_KEY = 'kroma.mobile.accounts';
const LEGACY_KEY = 'kroma.mobile.session';

const account = (over: Partial<MobileAccount> = {}): MobileAccount => ({
  serverUrl: 'https://kroma.local',
  accessToken: 'tok',
  user: { id: 'u1', username: 'max', email: null, avatarUrl: null, hasPin: false } as never,
  ...over,
});

beforeEach(() => {
  store.clear();
  unreadable.clear();
  unwritable.clear();
  vi.clearAllMocks();
});

describe('accounts', () => {
  it('round-trips a remembered account', async () => {
    await saveAccounts([account()]);
    await expect(loadAccounts()).resolves.toEqual([account()]);
  });

  it('stores only the slim user, not whatever the caller passed', async () => {
    await saveAccounts([
      account({ user: { id: 'u1', username: 'max', secret: 'do-not-persist' } as never }),
    ]);
    const raw = store.get(ACCOUNTS_KEY) ?? '';
    // A token in the keychain is one thing; the caller's full user object is another.
    expect(raw).not.toContain('do-not-persist');
    expect(raw).toContain('max');
  });

  it('migrates a single legacy session into the accounts list', async () => {
    store.set(LEGACY_KEY, JSON.stringify(account({ accessToken: 'old' })));
    const loaded = await loadAccounts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.accessToken).toBe('old');
    expect(store.has(LEGACY_KEY)).toBe(false);
    expect(store.has(ACCOUNTS_KEY)).toBe(true);
  });

  it('ignores a legacy blob that is missing what makes it usable', async () => {
    store.set(LEGACY_KEY, JSON.stringify({ serverUrl: 'https://x' }));
    await expect(loadAccounts()).resolves.toEqual([]);
  });

  it('reads as empty rather than throwing on corrupt json', async () => {
    store.set(ACCOUNTS_KEY, '{not json');
    await expect(loadAccounts()).resolves.toEqual([]);
  });
});

describe('servers and the active pointer', () => {
  it('round-trips the server list', async () => {
    await saveServers([{ url: 'https://a', lastUsedAt: 1 }]);
    await expect(loadServers()).resolves.toEqual([{ url: 'https://a', lastUsedAt: 1 }]);
  });

  it('reads an empty list rather than throwing on corrupt json', async () => {
    await savePref('servers', '{not json');
    await expect(loadServers()).resolves.toEqual([]);
  });

  it('round-trips the active pointer, and clearing it reads as null', async () => {
    await saveActive({ serverUrl: 'https://a', userId: 'u1' });
    await expect(loadActive()).resolves.toEqual({ serverUrl: 'https://a', userId: 'u1' });
    await saveActive(null);
    await expect(loadActive()).resolves.toBeNull();
  });
});

describe('prefs', () => {
  it('writing null DELETES rather than storing the string "null"', async () => {
    await savePref('k', 'v');
    await savePref('k', null);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    await expect(loadPref('k')).resolves.toBeNull();
  });

  it('is best effort: an unwritable keychain does not throw', async () => {
    unwritable.add('kroma.mobile.pref.k');
    await expect(savePref('k', 'v')).resolves.toBeUndefined();
  });

  it('reads null rather than throwing when the keychain cannot be read', async () => {
    store.set('kroma.mobile.pref.k', 'v');
    unreadable.add('kroma.mobile.pref.k');
    await expect(loadPref('k')).resolves.toBeNull();
  });
});

describe('the PIN vault', () => {
  it('round-trips a PIN behind biometrics', async () => {
    await expect(savePinBehindBiometrics('https://a', 'u1', '1234')).resolves.toBe(true);
    await expect(readPinBehindBiometrics('https://a', 'u1', 'Unlock')).resolves.toBe('1234');
  });

  it('reports failure when the device cannot protect it', async () => {
    unwritable.add('kroma.mobile.pin.https___a.u1');
    await expect(savePinBehindBiometrics('https://a', 'u1', '1234')).resolves.toBe(false);
  });

  it('reads null when the prompt is cancelled', async () => {
    await savePinBehindBiometrics('https://a', 'u1', '1234');
    unreadable.add('kroma.mobile.pin.https___a.u1');
    await expect(readPinBehindBiometrics('https://a', 'u1', 'Unlock')).resolves.toBeNull();
  });

  it('sanitizes the server url into a keychain-safe key', async () => {
    await savePinBehindBiometrics('https://kroma.local:4040/', 'u1', '1234');
    const key = [...store.keys()].find((k) => k.startsWith('kroma.mobile.pin.'));
    // Everything outside [A-Za-z0-9._-] becomes an underscore.
    expect(key).toBeDefined();
    expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('reports whether the device can guard the vault at all', () => {
    expect(canStoreBiometricPin()).toBe(true);
  });
});

describe('the biometric profile lock', () => {
  it('is off until it is turned on', async () => {
    await expect(isBiometricLockEnabled('https://a', 'u1')).resolves.toBe(false);
  });

  it('reads as LOCKED when the keychain cannot be read', async () => {
    await setBiometricLockEnabled('https://a', 'u1', true);
    unreadable.add('kroma.mobile.pref.biolock.https___a.u1');
    // An unreadable keychain must read as locked, never as unlocked.
    await expect(isBiometricLockEnabled('https://a', 'u1')).resolves.toBe(true);
  });

  it('turns on, and off again', async () => {
    await expect(setBiometricLockEnabled('https://a', 'u1', true)).resolves.toBe(true);
    await expect(isBiometricLockEnabled('https://a', 'u1')).resolves.toBe(true);
    await setBiometricLockEnabled('https://a', 'u1', false);
    await expect(isBiometricLockEnabled('https://a', 'u1')).resolves.toBe(false);
  });

  it('refuses to turn on when the sentinel cannot be stored', async () => {
    unwritable.add('kroma.mobile.biolock.https___a.u1');
    await expect(setBiometricLockEnabled('https://a', 'u1', true)).resolves.toBe(false);
    // A lock the device cannot enforce must not be recorded either.
    await expect(isBiometricLockEnabled('https://a', 'u1')).resolves.toBe(false);
  });

  it('passes only when the sentinel actually reads back', async () => {
    await setBiometricLockEnabled('https://a', 'u1', true);
    await expect(passBiometricLock('https://a', 'u1', 'Unlock')).resolves.toBe(true);
  });

  it('denies on a cancelled or failed prompt', async () => {
    await setBiometricLockEnabled('https://a', 'u1', true);
    unreadable.add('kroma.mobile.biolock.https___a.u1');
    await expect(passBiometricLock('https://a', 'u1', 'Unlock')).resolves.toBe(false);
  });

  it('denies when nothing was ever stored', async () => {
    await expect(passBiometricLock('https://a', 'u1', 'Unlock')).resolves.toBe(false);
  });
});

describe('the biometric unlock opt-out', () => {
  it('defaults ON, so a stored PIN tries Face ID before the pad', async () => {
    await expect(isBiometricUnlockEnabled('https://a', 'u1')).resolves.toBe(true);
  });

  it('opts out, and back in', async () => {
    await setBiometricUnlockEnabled('https://a', 'u1', false);
    await expect(isBiometricUnlockEnabled('https://a', 'u1')).resolves.toBe(false);
    await setBiometricUnlockEnabled('https://a', 'u1', true);
    await expect(isBiometricUnlockEnabled('https://a', 'u1')).resolves.toBe(true);
  });

  it('is per account, not per device', async () => {
    await setBiometricUnlockEnabled('https://a', 'u1', false);
    await expect(isBiometricUnlockEnabled('https://a', 'u2')).resolves.toBe(true);
  });
});
