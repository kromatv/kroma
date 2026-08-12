// The standalone biometric lock, at boot: a SECURITY decision, not a
// convenience: this function returning false is the only thing standing
// between someone holding the phone and someone else's profile.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const isBiometricLockEnabled = vi.hoisted(() =>
  vi.fn(async (_serverUrl: string, _userId: string) => false),
);
const passBiometricLock = vi.hoisted(() =>
  vi.fn(async (_serverUrl: string, _userId: string, _prompt: string) => true),
);
vi.mock('./storage', () => ({ isBiometricLockEnabled, passBiometricLock }));

const getLocales = vi.hoisted(() => vi.fn(() => [{ languageTag: 'fr-CH' }]));
vi.mock('expo-localization', () => ({ getLocales }));

import { passBootBiometricGate, passProfileBiometricGate } from './biometricGate';
import type { MobileAccount } from './storage';

function promptShown(): string {
  const call = passBiometricLock.mock.calls[0];
  if (!call) throw new Error('the system prompt was never raised');
  return call[2];
}

const account = (over: { hasPin?: boolean; id?: string; serverUrl?: string } = {}) =>
  ({
    serverUrl: over.serverUrl ?? 'https://kroma.local',
    accessToken: 'tok',
    user: { id: over.id ?? 'u1', username: 'max', hasPin: over.hasPin ?? false },
  }) as MobileAccount;

beforeEach(() => {
  vi.clearAllMocks();
  isBiometricLockEnabled.mockResolvedValue(false);
  passBiometricLock.mockResolvedValue(true);
  getLocales.mockReturnValue([{ languageTag: 'fr-CH' }]);
});

describe('passProfileBiometricGate', () => {
  it('lets a PIN-locked profile through without prompting', async () => {
    await expect(passProfileBiometricGate(account({ hasPin: true }), 'Unlock')).resolves.toBe(true);
    expect(isBiometricLockEnabled).not.toHaveBeenCalled();
    expect(passBiometricLock).not.toHaveBeenCalled();
  });

  it('lets an unlocked profile through', async () => {
    isBiometricLockEnabled.mockResolvedValue(false);
    await expect(passProfileBiometricGate(account(), 'Unlock')).resolves.toBe(true);
    expect(passBiometricLock).not.toHaveBeenCalled();
  });

  it('demands the system prompt for a biometric-locked profile', async () => {
    isBiometricLockEnabled.mockResolvedValue(true);
    passBiometricLock.mockResolvedValue(true);
    await expect(passProfileBiometricGate(account(), 'Unlock')).resolves.toBe(true);
    expect(passBiometricLock).toHaveBeenCalledWith('https://kroma.local', 'u1', 'Unlock');
  });

  it('REFUSES when the prompt is cancelled or fails', async () => {
    isBiometricLockEnabled.mockResolvedValue(true);
    passBiometricLock.mockResolvedValue(false);
    await expect(passProfileBiometricGate(account(), 'Unlock')).resolves.toBe(false);
  });

  it('asks about the profile it was handed, not the device', async () => {
    isBiometricLockEnabled.mockResolvedValue(true);
    await passProfileBiometricGate(account({ id: 'u2', serverUrl: 'https://attic' }), 'Unlock');
    // The lock is per (server, user): two profiles on one phone are two locks.
    expect(isBiometricLockEnabled).toHaveBeenCalledWith('https://attic', 'u2');
    expect(passBiometricLock).toHaveBeenCalledWith('https://attic', 'u2', 'Unlock');
  });
});

describe('passBootBiometricGate', () => {
  it('prompts in the device language', async () => {
    isBiometricLockEnabled.mockResolvedValue(true);
    getLocales.mockReturnValue([{ languageTag: 'fr-CH' }]);
    await passBootBiometricGate(account());

    const prompt = promptShown();
    // A real translation, not the key: this string is what the OS shows on the
    // Face ID sheet, and there is no I18nProvider mounted this early.
    expect(prompt).toBeTypeOf('string');
    expect(prompt).not.toBe('auth.faceUnlock');
    expect(prompt).not.toBe('');
  });

  it('falls back to the default locale when the device offers none', async () => {
    isBiometricLockEnabled.mockResolvedValue(true);
    getLocales.mockReturnValue([]);
    await expect(passBootBiometricGate(account())).resolves.toBe(true);
    const prompt = promptShown();
    expect(prompt).toBeTypeOf('string');
    expect(prompt).not.toBe('');
  });

  it('skips an unrecognised language rather than failing on it', async () => {
    isBiometricLockEnabled.mockResolvedValue(true);
    // A tag KROMA has no catalog for, ahead of one it does.
    getLocales.mockReturnValue([{ languageTag: 'xx-YY' }, { languageTag: 'fr-CH' }]);
    await expect(passBootBiometricGate(account())).resolves.toBe(true);
  });

  it('carries the same three answers as the profile gate', async () => {
    await expect(passBootBiometricGate(account({ hasPin: true }))).resolves.toBe(true);

    isBiometricLockEnabled.mockResolvedValue(true);
    passBiometricLock.mockResolvedValue(false);
    await expect(passBootBiometricGate(account())).resolves.toBe(false);
  });
});
