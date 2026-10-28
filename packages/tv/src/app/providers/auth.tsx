import { useAccountStorage } from '@kromatv/ui';
// Multi-server per-user session for the TV: unlike the web (single origin), the
// TV remembers profiles from several KROMA servers at once.

import { apiErrorBody, KromaApiError, type KromaClient } from '@kromatv/client';
import {
  type AuthResult,
  normalizeServerUrl as norm,
  type StoredSession,
  User,
  type UserId,
} from '@kromatv/client/accounts';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';

/** Whether a request was refused because the device's access token is gone: revoked from
 * another device or expired. No PIN can rescue it; the profile has to be paired again. */
export function isTokenRevoked(e: unknown): boolean {
  return e instanceof KromaApiError && e.status === 401 && apiErrorBody(e).tokenInvalid === true;
}

const keyOf = (a: Pick<StoredSession, 'serverUrl' | 'user'>) => `${norm(a.serverUrl)}|${a.user.id}`;

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}

// Field by field off the schema, so a field added to `User` is compared too.
function sameUser(a: User, b: User): boolean {
  const before: Record<string, unknown> = a;
  const after: Record<string, unknown> = b;
  return Object.keys(User.shape).every((field) => sameValue(before[field], after[field]));
}

// A fresh object for the user we already have would change `user`'s identity and
// re-run every consumer's refresh for nothing.
function withUser(current: StoredSession | null, user: User): StoredSession | null {
  if (!current || current.user.id !== user.id || sameUser(current.user, user)) return current;
  return { ...current, user };
}

interface Auth {
  session: StoredSession | null;
  user: User | null;
  accounts: StoredSession[];
  ready: boolean;
  login: (res: AuthResult, serverUrl: string) => void;
  activate: (account: StoredSession) => void;
  switchProfile: () => void;
  forget: (userId: UserId, serverUrl: string | undefined) => void;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<User>) => void;
  isUnlocked: (account: Pick<StoredSession, 'serverUrl' | 'user'>) => boolean;
}

const AuthCtx = createContext<Auth | null>(null);

export function AuthProvider({
  client,
  activeServerUrl,
  setActiveServer,
  onSignedInChange,
  children,
}: Readonly<{
  client: KromaClient | null;
  activeServerUrl: string | null;
  setActiveServer: (url: string) => void;
  onSignedInChange: (signedIn: boolean) => void;
  children: ReactNode;
}>) {
  const {
    loadSession,
    saveSession,
    loadAccounts,
    clearSession,
    forgetAccount: forgetAccountStore,
  } = useAccountStorage();
  const [session, setSession] = useState<StoredSession | null>(() => loadSession());
  const [accounts, setAccounts] = useState<StoredSession[]>(() => loadAccounts());
  // The access token whose bearer is live, so `ready` can be read during render:
  // React runs a child's effects before its parent's, and a flag raised in this
  // provider's effect would let one bearer-less round of requests out first.
  const [resumed, setResumed] = useState<string | null>(null);
  const unlocked = useRef<Set<string>>(new Set(session ? [keyOf(session)] : []));

  if (!session && resumed !== null) setResumed(null);
  const ready = !client || !session || resumed === session.accessToken;

  const drop = useCallback(
    (c: KromaClient | null) => {
      c?.setAuthToken();
      c?.setRefreshHandler();
      unlocked.current.clear();
      clearSession();
      setResumed(null);
      setSession(null);
    },
    [clearSession],
  );

  const foreign = !!client && !!session && norm(session.serverUrl) !== norm(activeServerUrl);
  const [dropNonce, setDropNonce] = useState(0);
  if (foreign) {
    setSession(null);
    setResumed(null);
    setDropNonce((n) => n + 1);
  }
  const releaseForeign = useEffectEvent(() => {
    client?.setAuthToken();
    client?.setRefreshHandler();
    unlocked.current.clear();
    clearSession();
  });
  useEffect(() => {
    if (dropNonce > 0) releaseForeign();
  }, [dropNonce]);

  // The bearer is only applied when the session belongs to the server the client
  // points at: a token for server A must never ride a request to server B.
  useEffect(() => {
    if (!client) return;
    if (!session) {
      client.setAuthToken();
      client.setRefreshHandler();
      return;
    }
    if (norm(session.serverUrl) !== norm(activeServerUrl)) return;

    let cancelled = false;
    // One exchange for the boot and for a 401 alike: `sharedTokenExchange`
    // coalesces them, so a poster grid full of 401s cannot trip the
    // brute-force guard with N of them.
    const resume = (stored: StoredSession): Promise<string | undefined> =>
      client.session
        .sharedTokenExchange(() => client.accounts.exchangeToken(stored.accessToken))
        .then((res) => {
          if (cancelled) return undefined;
          client.setAuthToken(res.token);
          setSession((cur) => withUser(cur, res.user));
          saveSession({ ...stored, user: res.user });
          setResumed(stored.accessToken);
          return res.token as string | undefined;
        })
        .catch((e: unknown) => {
          if (cancelled) return undefined;
          // Unresumable (revoked/expired token, or PIN required after a reset):
          // drop to the picker rather than a signed-in state with no bearer.
          if (isTokenRevoked(e)) forgetAccountStore(stored.user.id, stored.serverUrl);
          else if (apiErrorBody(e).pinRequired) {
            saveSession({ ...stored, user: { ...stored.user, hasPin: true } });
          }
          drop(client);
          setAccounts(loadAccounts());
          return undefined;
        });

    client.setRefreshHandler(() => resume(session));
    if (resumed !== session.accessToken) void resume(session);
    return () => {
      cancelled = true;
      client.setRefreshHandler();
    };
  }, [
    client,
    session,
    activeServerUrl,
    resumed,
    drop,
    saveSession,
    forgetAccountStore,
    loadAccounts,
  ]);

  useEffect(() => {
    onSignedInChange(ready && Boolean(session));
  }, [ready, session, onSignedInChange]);

  const enter = useCallback(
    (s: StoredSession) => {
      saveSession(s);
      unlocked.current.add(keyOf(s));
      setActiveServer(norm(s.serverUrl));
      setSession(s);
      setAccounts(loadAccounts());
    },
    [setActiveServer, loadAccounts, saveSession],
  );

  const login = useCallback(
    (res: AuthResult, serverUrl: string) => {
      // Its bearer is already live, so the effect must not exchange it again.
      if (client && norm(client.baseUrl) === norm(serverUrl)) {
        client.setAuthToken(res.token);
        client.session.setSessionMediaTicket(res.mediaTicket);
        setResumed(res.accessToken);
      } else {
        // A new server gets its own client and boot exchange before requests resume.
        setResumed(null);
      }
      enter({ serverUrl: norm(serverUrl), accessToken: res.accessToken, user: res.user });
    },
    [enter, client],
  );

  const activate = useCallback(
    (account: StoredSession) => {
      enter({ ...account, serverUrl: norm(account.serverUrl) });
    },
    [enter],
  );

  const switchProfile = useCallback(() => {
    if (session) client?.accounts.relock(session.accessToken).catch(() => undefined);
    drop(client);
  }, [client, session, drop]);

  const forget = useCallback(
    (userId: UserId, serverUrl: string | undefined) => {
      forgetAccountStore(userId, serverUrl);
      setAccounts(loadAccounts());
      setSession((s) => {
        if (s?.user.id === userId && norm(s?.serverUrl) === norm(serverUrl)) {
          client?.setAuthToken();
          return null;
        }
        return s;
      });
    },
    [client, loadAccounts, forgetAccountStore],
  );

  const logout = useCallback(async () => {
    const active = session;
    try {
      await client?.accounts.logout(active?.accessToken);
    } catch {
      /* best-effort server-side revocation */
    }
    if (active?.serverUrl) forgetAccountStore(active.user.id, active.serverUrl);
    drop(client);
    setAccounts(loadAccounts());
  }, [client, session, drop, loadAccounts, forgetAccountStore]);

  const updateUser = useCallback(
    (patch: Partial<User>) => {
      if (!session) return;
      const next: StoredSession = { ...session, user: { ...session.user, ...patch } };
      // `saveSession` rewrites the remembered-accounts entry too, so `accounts`
      // must be re-read or the picker keeps showing a lock for a disabled PIN.
      saveSession(next);
      setSession(next);
      setAccounts(loadAccounts());
    },
    [
      session, // `saveSession` rewrites the remembered-accounts entry too, so `accounts`
      // must be re-read or the picker keeps showing a lock for a disabled PIN.
      saveSession,
      loadAccounts,
    ],
  );

  const isUnlocked = useCallback(
    (account: Pick<StoredSession, 'serverUrl' | 'user'>) => unlocked.current.has(keyOf(account)),
    [],
  );

  const value = useMemo<Auth>(
    () => ({
      session,
      user: session?.user ?? null,
      accounts,
      ready,
      login,
      activate,
      switchProfile,
      forget,
      logout,
      updateUser,
      isUnlocked,
    }),
    [
      session,
      accounts,
      ready,
      login,
      activate,
      switchProfile,
      forget,
      logout,
      updateUser,
      isUnlocked,
    ],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>');
  return ctx;
}

export function useAuthMaybe(): Auth | null {
  return useContext(AuthCtx);
}
