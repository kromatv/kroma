// Auth + server session: multiple saved servers, multiple remembered accounts
// (device credentials in SecureStore), one active session. The long-lived
// accessToken is stored and exchanged on demand for a short-lived bearer kept
// in memory; a 401 mid-flight silently re-exchanges.

import { setSessionToken } from '@kromatv/client';
import { normalizeServerUrl, type User } from '@kromatv/client/accounts';
import type { QueryClient } from '@kromatv/client/query';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { makeClient } from '#mobile/lib/device';
import {
  deletePinBehindBiometrics,
  type MobileAccount,
  type ServerEntry,
  saveActive,
  setBiometricLockEnabled,
} from '#mobile/lib/storage';
import { useBootRestore } from './boot';
import { sameAccount, useAccountStore, useServerStore } from './stores';

export interface AuthSession {
  status: 'booting' | 'signedOut' | 'signedIn';
  serverUrl: string | null;
  client: QueryClient | null;
  user: User | null;
  servers: ServerEntry[];
  accounts: MobileAccount[];
  connect(url: string): Promise<void>;
  selectServer(url: string): void;
  renameServer(url: string, name: string): void;
  login(identifier: string, password: string): Promise<void>;
  // PIN-locked profiles need `pin` (401 body `pinRequired: true` otherwise).
  switchAccount(account: MobileAccount, pin?: string): Promise<void>;
  /** Clear the PIN-verified flag the server keeps on a stored credential, so
   *  the next exchange re-prompts. */
  relockAccount(account: MobileAccount): Promise<void>;
  switchProfile(): void;
  signOut(): Promise<void>;
  forgetAccount(account: MobileAccount): void;
  forgetServer(url: string): void;
  setUser(user: User): void;
}

const Ctx = createContext<AuthSession | null>(null);

export function useSession(): AuthSession {
  const value = useContext(Ctx);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}

/** The signed-in client; screens behind the auth gate can rely on it. */
export function useClient(): QueryClient {
  const { client } = useSession();
  if (!client) throw new Error('useClient before sign-in');
  return client;
}

export function SessionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [status, setStatus] = useState<AuthSession['status']>('booting');
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [client, setClient] = useState<QueryClient | null>(null);
  const accounts = useAccountStore();
  const servers = useServerStore();

  const enterSession = useCallback(
    (url: string, accessToken: string, token: string, freshUser: User) => {
      const next = makeClient(url);
      next.setAuthToken(token);
      next.setRefreshHandler(async () => {
        try {
          const { token: newToken, user: refreshed } =
            await next.accounts.exchangeToken(accessToken);
          next.setAuthToken(newToken);
          setUser(refreshed);
          return newToken;
        } catch {
          return undefined;
        }
      });
      setClient(next);
      setServerUrl(url);
      setUser(freshUser);
      setStatus('signedIn');
      const account: MobileAccount = { serverUrl: url, accessToken, user: freshUser };
      accounts.persist([
        account,
        ...accounts.ref.current.filter((a) => !sameAccount(a, url, freshUser.id)),
      ]);
      void saveActive({ serverUrl: url, userId: freshUser.id });
      servers.touch(url);
    },
    [accounts, servers],
  );

  const setSignedOut = useCallback(() => setStatus('signedOut'), []);
  useBootRestore({ accounts, servers, makeClient, enterSession, setServerUrl, setSignedOut });

  const connect = useCallback(
    async (url: string) => {
      // A bare host ("luma.stmx.ch") tries https first, then http, so users
      // never have to type the scheme. Each probe validates that this really
      // is a Kroma server before saving.
      const raw = url.trim();
      const candidates = /^https?:\/\//i.test(raw) ? [raw] : [`https://${raw}`, `http://${raw}`];
      let lastError: unknown;
      for (const candidate of candidates) {
        const normalized = normalizeServerUrl(candidate);
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 5000);
        try {
          const health = await makeClient(normalized).media.health({ signal: abort.signal });
          setServerUrl(normalized);
          // `name` is LAN-only: a server reached over the internet answers
          // without one, and `touch` then keeps whatever label we already had.
          servers.touch(normalized, health.name);
          return;
        } catch (err) {
          lastError = err;
        } finally {
          clearTimeout(timer);
        }
      }
      throw lastError ?? new Error('unreachable');
    },
    [servers],
  );

  const selectServer = useCallback((url: string) => setServerUrl(url), []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      if (!serverUrl) throw new Error('no server');
      const result = await makeClient(serverUrl).accounts.login(identifier, password);
      enterSession(serverUrl, result.accessToken, result.token, result.user);
    },
    [serverUrl, enterSession],
  );

  const switchAccount = useCallback(
    async (account: MobileAccount, pin?: string) => {
      const probe = makeClient(account.serverUrl);
      const { token, user: fresh } = await probe.accounts.exchangeToken(account.accessToken, pin);
      enterSession(account.serverUrl, account.accessToken, token, fresh);
    },
    [enterSession],
  );

  const relockAccount = useCallback(async (account: MobileAccount) => {
    await makeClient(account.serverUrl).accounts.relock(account.accessToken);
  }, []);

  const forgetSecrets = useCallback((url: string, userId: string) => {
    void deletePinBehindBiometrics(url, userId);
    void setBiometricLockEnabled(url, userId, false);
  }, []);

  const leave = useCallback(
    (forgetActive: boolean) => {
      const current = client;
      const activeUser = user;
      const active =
        activeUser && serverUrl
          ? accounts.ref.current.find((a) => sameAccount(a, serverUrl, activeUser.id))
          : undefined;
      setClient(null);
      setUser(null);
      setStatus('signedOut');
      // The events socket must not keep authenticating as the account we left.
      setSessionToken(undefined);
      void saveActive(null);
      if (forgetActive && activeUser && serverUrl) {
        accounts.forget(serverUrl, activeUser.id);
        forgetSecrets(serverUrl, activeUser.id);
        if (current && active)
          void current.accounts.logout(active.accessToken).catch(() => undefined);
      } else if (current && active) {
        // Back to the profile picker: re-arm the PIN gate on this credential.
        void current.accounts.relock(active.accessToken).catch(() => undefined);
      }
    },
    [client, user, serverUrl, accounts, forgetSecrets],
  );

  const switchProfile = useCallback(() => leave(false), [leave]);
  const signOut = useCallback(async () => leave(true), [leave]);

  const forgetAccount = useCallback(
    (account: MobileAccount) => {
      accounts.forget(account.serverUrl, account.user.id);
      forgetSecrets(account.serverUrl, account.user.id);
    },
    [accounts, forgetSecrets],
  );

  const forgetServer = useCallback(
    (url: string) => {
      servers.remove(url);
      accounts.persist(accounts.ref.current.filter((a) => a.serverUrl !== url));
      setServerUrl((current) => (current === url ? null : current));
    },
    [accounts, servers],
  );

  const updateUser = useCallback(
    (u: User) => {
      setUser(u);
      if (!serverUrl) return;
      accounts.persist(
        accounts.ref.current.map((a) => (sameAccount(a, serverUrl, u.id) ? { ...a, user: u } : a)),
      );
    },
    [serverUrl, accounts],
  );

  const renameServer = servers.rename;
  const value = useMemo<AuthSession>(
    () => ({
      status,
      serverUrl,
      client,
      user,
      servers: servers.servers,
      accounts: accounts.accounts,
      connect,
      selectServer,
      renameServer,
      login,
      switchAccount,
      relockAccount,
      switchProfile,
      signOut,
      forgetAccount,
      forgetServer,
      setUser: updateUser,
    }),
    [
      status,
      serverUrl,
      client,
      user,
      servers.servers,
      accounts.accounts,
      connect,
      selectServer,
      renameServer,
      login,
      switchAccount,
      relockAccount,
      switchProfile,
      signOut,
      forgetAccount,
      forgetServer,
      updateUser,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
