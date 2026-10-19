import { useSession } from '#mobile/lib/session';
// Data hooks backing the sign-in screen.

import type { KromaClient } from '@kromatv/client';
import type { PublicUser } from '@kromatv/client/accounts';
import { type DiscoveredServer, discoverServers } from '@kromatv/core';
import { useEffect, useRef, useState } from 'react';
import { makeClient } from '#mobile/lib/device';
import { getDeviceLocalIp } from '#mobile/lib/localIp';
import { isBiometricLockEnabled, type MobileAccount } from '#mobile/lib/storage';

export const keyOf = (a: MobileAccount) => `${a.serverUrl}::${a.user.id}`;

export const hostOf = (url: string) => url.replace(/^https?:\/\//, '');

export function useClientCache(): (url: string) => KromaClient {
  const { requestLocale } = useSession();
  const clientsRef = useRef(new Map<string, KromaClient>());
  return (url: string) => {
    const cached = clientsRef.current.get(url);
    if (cached) {
      cached.setLocale(requestLocale());
      return cached;
    }
    const fresh = makeClient(url, requestLocale());
    clientsRef.current.set(url, fresh);
    return fresh;
  };
}

/** While `active`, sweeps the LAN for KROMA servers in a loop, so the local
 * servers list stays live without a manual rescan. */
export function useDiscoveryLoop(active: boolean): DiscoveredServer[] {
  const [found, setFound] = useState<DiscoveredServer[]>([]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sweep = async () => {
      try {
        const localIp = await getDeviceLocalIp();
        const hits = await discoverServers({ localIp: localIp ?? undefined });
        if (!alive) return;
        setFound(hits);
      } catch {
        // Transient network error; the next sweep retries.
      }
      if (alive) timer = setTimeout(() => void sweep(), 4000);
    };
    void sweep();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active]);
  return found;
}

/** `keyOf` keys of the accounts locked behind device biometrics without a
 * server PIN. */
export function useBiometricLockedKeys(accounts: MobileAccount[]): Set<string> {
  const [locked, setLocked] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      accounts.map(async (a) =>
        (await isBiometricLockEnabled(a.serverUrl, a.user.id)) ? keyOf(a) : null,
      ),
    ).then((keys) => {
      if (!cancelled) setLocked(new Set(keys.filter((k): k is string => k !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [accounts]);
  return locked;
}

const EMPTY_ROSTER: PublicUser[] = [];

/** Public profile roster of the selected server, when it exposes one; empty on
 * failure. */
export function useServerRoster(serverUrl: string | null): PublicUser[] {
  const { requestLocale } = useSession();
  const [loaded, setLoaded] = useState<{ serverUrl: string; users: PublicUser[] } | null>(null);
  useEffect(() => {
    if (!serverUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const probe = makeClient(serverUrl, requestLocale());
        const config = await probe.accounts.config();
        if (cancelled || !config.publicUserList || !config.hasAccounts) return;
        const users = await probe.accounts.users();
        if (!cancelled) setLoaded({ serverUrl, users });
      } catch {
        // No roster; saved accounts + the form still work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverUrl, requestLocale]);
  return loaded !== null && loaded.serverUrl === serverUrl ? loaded.users : EMPTY_ROSTER;
}
