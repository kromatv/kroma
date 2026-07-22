// Data hooks backing the sign-in screen: a per-server client cache, the
// continuous LAN discovery sweep while the server picker is open, and the
// selected server's public profile roster.

import { type DiscoveredServer, discoverServers, KromaClient, type PublicUser } from '@kroma/core';
import { useEffect, useRef, useState } from 'react';
import { getDeviceLocalIp } from '../lib/localIp';
import { isBiometricLockEnabled, type MobileAccount } from '../lib/storage';

/** Stable identity of a remembered account across servers. */
export const keyOf = (a: MobileAccount) => `${a.serverUrl}::${a.user.id}`;

export const hostOf = (url: string) => url.replace(/^https?:\/\//, '');

/** Per-server KromaClient cache (art URL resolution across servers). */
export function useClientCache(): (url: string) => KromaClient {
  const clientsRef = useRef(new Map<string, KromaClient>());
  return (url: string) => {
    const cached = clientsRef.current.get(url);
    if (cached) return cached;
    const fresh = new KromaClient({ baseUrl: url });
    clientsRef.current.set(url, fresh);
    return fresh;
  };
}

/** While `active`, sweep the LAN for KROMA servers in a loop so the local
 * servers section stays live without a manual rescan. */
export function useDiscoveryLoop(active: boolean): DiscoveredServer[] {
  const [found, setFound] = useState<DiscoveredServer[]>([]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void (async () => {
      while (alive) {
        try {
          const localIp = await getDeviceLocalIp();
          const hits = await discoverServers({ localIp: localIp ?? undefined });
          if (!alive) return;
          setFound(hits);
        } catch {
          // Transient network error; the next sweep retries.
        }
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }
    })();
    return () => {
      alive = false;
    };
  }, [active]);
  return found;
}

/** `keyOf` keys of the accounts locked behind device biometrics without a
 * server PIN, so their gate tiles show the same lock badge as PIN ones. */
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

/** Public profile roster of the selected server (when the server exposes one).
 * Resets on server change; failures leave it empty, the form still works. */
export function useServerRoster(serverUrl: string | null): PublicUser[] {
  const [roster, setRoster] = useState<PublicUser[]>([]);
  useEffect(() => {
    if (!serverUrl) return;
    let cancelled = false;
    setRoster([]);
    void (async () => {
      try {
        const probe = new KromaClient({ baseUrl: serverUrl });
        const config = await probe.authConfig();
        if (cancelled || !config.publicUserList || !config.hasAccounts) return;
        const users = await probe.users();
        if (!cancelled) setRoster(users);
      } catch {
        // No roster; saved accounts + the form still work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverUrl]);
  return roster;
}
