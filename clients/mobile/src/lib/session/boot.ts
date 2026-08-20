// Cold start: restore the saved servers and remembered accounts, then decide
// whether this launch may silently re-enter the last active profile.

import { KromaApiError, type KromaClient, normalizeServerUrl } from '@kroma/core';
import { useEffect } from 'react';
import { z } from 'zod';
import { passBootBiometricGate } from '#mobile/lib/biometricGate';
import { loadAccounts, loadActive, loadServers, type MobileAccount } from '#mobile/lib/storage';
import { type AccountStore, type ServerStore, sameAccount } from './stores';

interface BootDeps {
  accounts: AccountStore;
  servers: ServerStore;
  makeClient(serverUrl: string): KromaClient;
  enterSession(url: string, accessToken: string, token: string, user: MobileAccount['user']): void;
  setServerUrl(url: string | null): void;
  setSignedOut(): void;
}

// True once the component unmounted; every `await` must re-check it.
type Cancelled = () => boolean;

const PinGate = z.object({ pinRequired: z.literal(true) });

// A PIN-locked profile answers 401 with `{ pinRequired: true }`, which must
// NOT be treated as a dead credential.
function isPinGated(err: unknown): boolean {
  return err instanceof KromaApiError && PinGate.safeParse(err.body).success;
}

// __DEV__-gated so release builds never bake in the .env.local rig.
function devServer(): string | undefined {
  return __DEV__ ? process.env.EXPO_PUBLIC_KROMA_SERVER : undefined;
}

// Mirrors the TV preview auth: dev-only auto sign-in on a fresh app.
async function devAutoLogin(deps: BootDeps, cancelled: Cancelled): Promise<boolean> {
  const server = devServer();
  const devLogin = __DEV__ ? process.env.EXPO_PUBLIC_KROMA_DEV_LOGIN : undefined;
  if (!server || !devLogin) return false;
  try {
    const url = normalizeServerUrl(server);
    const [identifier, password] = devLogin.split(':');
    const result = await deps.makeClient(url).login(identifier ?? '', password ?? '');
    if (cancelled()) return true;
    deps.enterSession(url, result.accessToken, result.token, result.user);
    return true;
  } catch {
    return false;
  }
}

// A revoked credential is dropped; a network failure keeps the account so the
// next launch can retry. A PIN-gated 401 is not a revocation.
function onResumeFailed(deps: BootDeps, account: MobileAccount, err: unknown): void {
  if (isPinGated(err)) {
    // The gate learned this profile is PIN-locked; reflect it on the stored
    // account (its cached user may predate the PIN).
    deps.accounts.persist(
      deps.accounts.ref.current.map((a) =>
        sameAccount(a, account.serverUrl, account.user.id)
          ? { ...a, user: { ...a.user, hasPin: true } }
          : a,
      ),
    );
  } else if (err instanceof KromaApiError) {
    deps.accounts.forget(account.serverUrl, account.user.id);
  }
}

async function resumeAccount(
  deps: BootDeps,
  account: MobileAccount,
  fallbackUrl: string | null,
  cancelled: Cancelled,
): Promise<void> {
  try {
    const probe = deps.makeClient(account.serverUrl);
    const { token, user: fresh } = await probe.exchangeToken(account.accessToken);
    if (cancelled()) return;
    deps.enterSession(account.serverUrl, account.accessToken, token, fresh);
  } catch (err) {
    if (cancelled()) return;
    deps.setServerUrl(fallbackUrl);
    deps.setSignedOut();
    onResumeFailed(deps, account, err);
  }
}

async function restore(deps: BootDeps, cancelled: Cancelled): Promise<void> {
  const [storedServers, storedAccounts, active] = await Promise.all([
    loadServers(),
    loadAccounts(),
    loadActive(),
  ]);
  if (cancelled()) return;
  deps.servers.hydrate(storedServers);
  deps.accounts.hydrate(storedAccounts);
  const activeAccount = active
    ? storedAccounts.find((a) => sameAccount(a, active.serverUrl, active.userId))
    : null;
  const fallbackUrl = activeAccount?.serverUrl ?? storedServers[0]?.url ?? null;

  if (!activeAccount) {
    if (storedAccounts.length === 0 && (await devAutoLogin(deps, cancelled))) return;
    const dev = devServer();
    deps.setServerUrl(dev ? normalizeServerUrl(dev) : fallbackUrl);
    deps.setSignedOut();
    return;
  }

  // Standalone Face ID / Touch ID lock (no server PIN): a cold start may not
  // silently resume into the locked profile; failing the biometric check lands
  // on the profile gate instead.
  const gatePassed = await passBootBiometricGate(activeAccount);
  if (cancelled()) return;
  if (!gatePassed) {
    deps.setServerUrl(fallbackUrl);
    deps.setSignedOut();
    return;
  }

  await resumeAccount(deps, activeAccount, fallbackUrl, cancelled);
}

export function useBootRestore(deps: BootDeps): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: cold start runs ONCE per mount; re-running it would re-enter a session the user just left
  useEffect(() => {
    let stopped = false;
    void restore(deps, () => stopped);
    return () => {
      stopped = true;
    };
  }, []);
}
