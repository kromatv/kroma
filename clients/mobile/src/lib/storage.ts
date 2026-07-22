// Device persistence for the mobile client: remembered accounts (SecureStore,
// they hold device credentials) and saved servers / small prefs. Mirrors the
// TV client's multi-server model: any number of servers, any number of
// remembered accounts per server, one active pointer.

import type { User } from '@kroma/core';
import * as SecureStore from 'expo-secure-store';

const ACCOUNTS_KEY = 'kroma.mobile.accounts';
const LEGACY_SESSION_KEY = 'kroma.mobile.session';
const PREF_PREFIX = 'kroma.mobile.pref.';

export type SlimUser = Pick<User, 'id' | 'username' | 'email' | 'avatarUrl' | 'hasPin'>;

/** One remembered account: enough to silently re-enter it on any launch. */
export interface MobileAccount {
  serverUrl: string;
  accessToken: string;
  user: SlimUser;
}

export interface ServerEntry {
  url: string;
  /** Admin-configured server name from `/health`, refreshed on each contact. */
  name?: string;
  lastUsedAt: number;
}

export interface ActivePointer {
  serverUrl: string;
  userId: string;
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

export async function loadAccounts(): Promise<MobileAccount[]> {
  try {
    const raw = await SecureStore.getItemAsync(ACCOUNTS_KEY);
    if (raw) return JSON.parse(raw) as MobileAccount[];
    // One-time migration from the single-session era.
    const legacy = await SecureStore.getItemAsync(LEGACY_SESSION_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as MobileAccount;
      if (parsed.serverUrl && parsed.accessToken) {
        await saveAccounts([parsed]);
        await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY).catch(() => undefined);
        return [parsed];
      }
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
  try {
    const raw = await loadPref('servers');
    return raw ? (JSON.parse(raw) as ServerEntry[]) : [];
  } catch {
    return [];
  }
}

export async function saveServers(servers: ServerEntry[]): Promise<void> {
  await savePref('servers', JSON.stringify(servers));
}

export async function loadActive(): Promise<ActivePointer | null> {
  try {
    const raw = await loadPref('active');
    return raw ? (JSON.parse(raw) as ActivePointer) : null;
  } catch {
    return null;
  }
}

export async function saveActive(active: ActivePointer | null): Promise<void> {
  await savePref('active', active ? JSON.stringify(active) : null);
}

// ----- biometric PIN vault ----------------------------------------------------
// A PIN-locked profile's PIN, stored behind device biometrics (Face ID /
// Touch ID): unlocking reads it with a biometric prompt instead of the pad.

const PIN_KEY_PREFIX = 'kroma.mobile.pin.';

/** One account on one server, sanitized down to a keychain-safe identifier. */
function accountSlug(serverUrl: string, userId: string): string {
  return `${serverUrl}.${userId}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

function pinStoreKey(serverUrl: string, userId: string): string {
  return `${PIN_KEY_PREFIX}${serverUrl}.${userId}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Whether this device can guard the vault (Face ID / Touch ID / Android
 * biometrics enrolled); gates the toggle in the profile-lock settings. */
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

// Standalone biometric lock for profiles WITHOUT a server PIN: an explicit
// opt-in (default OFF) that gates entering the profile, both from the gate and
// on app launch, behind Face ID / Touch ID on this device. Passing the lock =
// successfully reading a keychain sentinel stored behind biometrics; the flag
// itself is a plain pref so the UI can render without prompting.

const BIOLOCK_SENTINEL_PREFIX = 'kroma.mobile.biolock.';

function bioLockSentinelKey(serverUrl: string, userId: string): string {
  return `${BIOLOCK_SENTINEL_PREFIX}${serverUrl}.${userId}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

function bioLockFlagKey(serverUrl: string, userId: string): string {
  return `biolock.${accountSlug(serverUrl, userId)}`;
}

/** Whether this profile is biometric-locked on this device. Fails CLOSED: an
 * unreadable keychain (a transient SecureStore error, or a device restored from
 * backup whose keychain is still locked right after boot) must read as "locked",
 * never as "no lock configured" - the second answer would open a locked profile
 * with no prompt at all. `loadPref` swallows its errors, so the raw read is done
 * here. */
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

/** Shows the system biometric prompt; true only when it succeeds. Fails closed
 * (cancel, failed scan or missing sentinel all deny). */
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

// Per-account opt-out of the biometric vault (default ON: the gate stores a
// pad-typed PIN and tries Face ID / Touch ID first on the next unlock).

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

/** Small non-secret prefs (locale override, saved servers, active pointer). */
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
