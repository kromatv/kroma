// Cold start: restore the saved servers and remembered accounts, then decide
// whether this launch may silently re-enter the last active profile.

import { KromaApiError, type KromaClient, normalizeServerUrl } from '@kroma/core';
import { useEffect } from 'react';
import { passBootBiometricGate } from '../biometricGate';
import { loadAccounts, loadActive, loadServers, type MobileAccount } from '../storage';
import { type AccountStore, type ServerStore, sameAccount } from './stores';

interface BootDeps {
  accounts: AccountStore;
  servers: ServerStore;
  makeClient(serverUrl: string): KromaClient;
  enterSession(url: string, accessToken: string, token: string, user: MobileAccount['user']): void;
  setServerUrl(url: string | null): void;
  setSignedOut(): void;
}

/** Was this 401 the PIN gate rather than a dead credential? A PIN-locked
 * profile answers `{ pinRequired: true }`, which must NOT drop the account. */
function isPinGated(err: unknown): boolean {
  return (
    err instanceof KromaApiError &&
    typeof err.body === 'object' &&
    err.body !== null &&
    (err.body as { pinRequired?: boolean }).pinRequired === true
  );
}

export function useBootRestore(deps: BootDeps): void {
  const { accounts, servers, makeClient, enterSession, setServerUrl, setSignedOut } = deps;
  // biome-ignore lint/correctness/useExhaustiveDependencies: cold start runs ONCE per mount; re-running it would re-enter a session the user just left
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedServers, storedAccounts, active] = await Promise.all([
        loadServers(),
        loadAccounts(),
        loadActive(),
      ]);
      if (cancelled) return;
      servers.hydrate(storedServers);
      accounts.hydrate(storedAccounts);
      const activeAccount = active
        ? storedAccounts.find((a) => sameAccount(a, active.serverUrl, active.userId))
        : null;
      const fallbackUrl = activeAccount?.serverUrl ?? storedServers[0]?.url ?? null;

      if (!activeAccount) {
        // Dev rig (mirrors the TV preview auth): auto sign-in on a fresh app.
        // __DEV__-gated so release builds never bake in the .env.local rig.
        const devServer = __DEV__ ? process.env.EXPO_PUBLIC_KROMA_SERVER : undefined;
        const devLogin = __DEV__ ? process.env.EXPO_PUBLIC_KROMA_DEV_LOGIN : undefined;
        if (storedAccounts.length === 0 && devServer && devLogin) {
          try {
            const url = normalizeServerUrl(devServer);
            const [identifier, password] = devLogin.split(':');
            const result = await makeClient(url).login(identifier ?? '', password ?? '');
            if (cancelled) return;
            enterSession(url, result.accessToken, result.token, result.user);
            return;
          } catch {
            // Fall through to the normal flow.
          }
        }
        setServerUrl(devServer ? normalizeServerUrl(devServer) : fallbackUrl);
        setSignedOut();
        return;
      }

      // Standalone Face ID / Touch ID lock (no server PIN): a cold start may
      // not silently resume into the locked profile; failing the biometric
      // check lands on the profile gate instead.
      const gatePassed = await passBootBiometricGate(activeAccount);
      if (cancelled) return;
      if (!gatePassed) {
        setServerUrl(fallbackUrl);
        setSignedOut();
        return;
      }

      try {
        const probe = makeClient(activeAccount.serverUrl);
        const { token, user: fresh } = await probe.exchangeToken(activeAccount.accessToken);
        if (cancelled) return;
        enterSession(activeAccount.serverUrl, activeAccount.accessToken, token, fresh);
      } catch (err) {
        if (cancelled) return;
        setServerUrl(fallbackUrl);
        setSignedOut();
        // A revoked credential is dropped; a network failure keeps the account
        // so the next launch (or a manual switch) can try again. A PIN-gated
        // 401 is NOT a revocation: keep the account so the gate can prompt.
        if (isPinGated(err)) {
          // The gate learned this profile is PIN-locked; reflect it on the
          // stored account (its cached user may predate the PIN).
          accounts.persist(
            accounts.ref.current.map((a) =>
              sameAccount(a, activeAccount.serverUrl, activeAccount.user.id)
                ? { ...a, user: { ...a.user, hasPin: true } }
                : a,
            ),
          );
        } else if (err instanceof KromaApiError) {
          accounts.forget(activeAccount.serverUrl, activeAccount.user.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
