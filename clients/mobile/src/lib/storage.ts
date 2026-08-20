// Device persistence: remembered accounts (in SecureStore, they hold device
// credentials), saved servers and small prefs.

import { User } from '@kroma/core';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

const ACCOUNTS_KEY = 'kroma.mobile.accounts';
const LEGACY_SESSION_KEY = 'kroma.mobile.session';
const PREF_PREFIX = 'kroma.mobile.pref.';

// `id` decides the account; the rest fall back rather than failing, so a blob
// written before `User` gained a field is not signed out on upgrade.
const SlimUser = User.pick({
  id: true,
  username: true,
  email: true,
  avatarUrl: true,
  hasPin: true,
}).extend({
  username: z.string().catch(''),
  email: z.string().catch(''),
  hasPin: z.boolean().catch(false),
});
export type SlimUser = z.infer<typeof SlimUser>;

const MobileAccount = z.object({
  serverUrl: z.string().min(1),
  accessToken: z.string().min(1),
  user: SlimUser,
});
export type MobileAccount = z.infer<typeof MobileAccount>;

const ServerEntry = z.object({
  url: z.string().min(1),
  name: z.string().optional(),
  lastUsedAt: z.number(),
});
export type ServerEntry = z.infer<typeof ServerEntry>;

const ActivePointer = z.object({
  serverUrl: z.string().min(1),
  userId: z.string().min(1),
});
export type ActivePointer = z.infer<typeof ActivePointer>;

function stored<S extends z.ZodType>(schema: S, raw: string | null): z.infer<S> | null {
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function slim(user: SlimUser): SlimUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    hasPin: user.hasPin,
  };
}

function usableAccounts(raw: string | null): MobileAccount[] | null {
  const entries = stored(z.array(z.unknown()), raw);
  if (!entries) return null;
  return entries.flatMap((entry) => {
    const account = MobileAccount.safeParse(entry);
    return account.success ? [account.data] : [];
  });
}

export async function loadAccounts(): Promise<MobileAccount[]> {
  try {
    const accounts = usableAccounts(await SecureStore.getItemAsync(ACCOUNTS_KEY));
    if (accounts) return accounts;
    // One-time migration from the single-session era.
    const legacy = stored(MobileAccount, await SecureStore.getItemAsync(LEGACY_SESSION_KEY));
    if (legacy) {
      await saveAccounts([legacy]);
      await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY).catch(() => undefined);
      return [legacy];
    }
    return [];
  } catch {
    return [];
  }
}

export async function saveAccounts(accounts: MobileAccount[]): Promise<void> {
  const slimmed = accounts.map((a) => ({ ...a, user: slim(a.user) }));
  await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(slimmed));
}

export async function loadServers(): Promise<ServerEntry[]> {
  return stored(z.array(ServerEntry), await loadPref('servers')) ?? [];
}

export async function saveServers(servers: ServerEntry[]): Promise<void> {
  await savePref('servers', JSON.stringify(servers));
}

export async function loadActive(): Promise<ActivePointer | null> {
  return stored(ActivePointer, await loadPref('active'));
}

export async function saveActive(active: ActivePointer | null): Promise<void> {
  await savePref('active', active ? JSON.stringify(active) : null);
}

// A PIN-locked profile's PIN, stored behind device biometrics: unlocking reads
// it with a biometric prompt instead of the pad.

const PIN_KEY_PREFIX = 'kroma.mobile.pin.';

function accountSlug(serverUrl: string, userId: string): string {
  return `${serverUrl}.${userId}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

function pinStoreKey(serverUrl: string, userId: string): string {
  return `${PIN_KEY_PREFIX}${serverUrl}.${userId}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function canStoreBiometricPin(): boolean {
  return SecureStore.canUseBiometricAuthentication();
}

/** Returns false when the device can't protect it (no passcode/biometrics). */
export async function savePinBehindBiometrics(
  serverUrl: string,
  userId: string,
  pin: string,
): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(pinStoreKey(serverUrl, userId), pin, {
      requireAuthentication: true,
    });
    return true;
  } catch {
    return false;
  }
}

/** Shows the system biometric prompt; null on cancel or when nothing stored. */
export async function readPinBehindBiometrics(
  serverUrl: string,
  userId: string,
  prompt: string,
): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(pinStoreKey(serverUrl, userId), {
      requireAuthentication: true,
      authenticationPrompt: prompt,
    });
  } catch {
    return null;
  }
}

export async function deletePinBehindBiometrics(serverUrl: string, userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(pinStoreKey(serverUrl, userId)).catch(() => undefined);
}

// Standalone biometric lock for profiles WITHOUT a server PIN (default OFF).
// Passing it = reading a keychain sentinel stored behind biometrics; the flag
// itself is a plain pref so the UI can render without prompting.

const BIOLOCK_SENTINEL_PREFIX = 'kroma.mobile.biolock.';

function bioLockSentinelKey(serverUrl: string, userId: string): string {
  return `${BIOLOCK_SENTINEL_PREFIX}${serverUrl}.${userId}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

function bioLockFlagKey(serverUrl: string, userId: string): string {
  return `biolock.${accountSlug(serverUrl, userId)}`;
}

/** Fails CLOSED: an unreadable keychain must read as "locked", never as "no lock
 *  configured", which would open a locked profile with no prompt. `loadPref`
 *  swallows its errors, so the raw read is done here. */
export async function isBiometricLockEnabled(serverUrl: string, userId: string): Promise<boolean> {
  try {
    return (
      (await SecureStore.getItemAsync(PREF_PREFIX + bioLockFlagKey(serverUrl, userId))) === '1'
    );
  } catch {
    return true;
  }
}

/** Returns false when the sentinel can't be stored (no biometrics enrolled). */
export async function setBiometricLockEnabled(
  serverUrl: string,
  userId: string,
  enabled: boolean,
): Promise<boolean> {
  if (enabled) {
    try {
      await SecureStore.setItemAsync(bioLockSentinelKey(serverUrl, userId), '1', {
        requireAuthentication: true,
      });
    } catch {
      return false;
    }
  } else {
    await SecureStore.deleteItemAsync(bioLockSentinelKey(serverUrl, userId)).catch(() => undefined);
  }
  await savePref(bioLockFlagKey(serverUrl, userId), enabled ? '1' : null);
  return true;
}

/** Fails closed: cancel, failed scan or missing sentinel all deny. */
export async function passBiometricLock(
  serverUrl: string,
  userId: string,
  prompt: string,
): Promise<boolean> {
  try {
    const sentinel = await SecureStore.getItemAsync(bioLockSentinelKey(serverUrl, userId), {
      requireAuthentication: true,
      authenticationPrompt: prompt,
    });
    return sentinel === '1';
  } catch {
    return false;
  }
}

// Per-account opt-out of the biometric vault, default ON.

function bioPrefKey(serverUrl: string, userId: string): string {
  return `bio.${accountSlug(serverUrl, userId)}`;
}

export async function isBiometricUnlockEnabled(
  serverUrl: string,
  userId: string,
): Promise<boolean> {
  return (await loadPref(bioPrefKey(serverUrl, userId))) !== '0';
}

export async function setBiometricUnlockEnabled(
  serverUrl: string,
  userId: string,
  enabled: boolean,
): Promise<void> {
  await savePref(bioPrefKey(serverUrl, userId), enabled ? null : '0');
}

export async function loadPref(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PREF_PREFIX + key);
  } catch {
    return null;
  }
}

export async function savePref(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(PREF_PREFIX + key);
    else await SecureStore.setItemAsync(PREF_PREFIX + key, value);
  } catch {
    // Prefs are best-effort.
  }
}
