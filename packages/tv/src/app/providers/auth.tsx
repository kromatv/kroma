// Multi-server per-user session for the TV: unlike the web (single origin), the
// TV remembers profiles from several KROMA servers at once.

import {
  type AuthResult,
  clearSession,
  forgetAccount as forgetAccountStore,
  type KromaClient,
  loadAccounts,
  loadSession,
  normalizeServerUrl as norm,
  type StoredSession,
  saveSession,
  sharedTokenExchange,
  User,
  type UserId,
} from '@kroma/core';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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
  forget: (userId: UserId, serverUrl: string) => void;
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
  const [session, setSession] = useState<StoredSession | null>(() => loadSession());
  const [accounts, setAccounts] = useState<StoredSession[]>(() => loadAccounts());
  // The access token whose bearer is live, so `ready` can be read during render:
  // React runs a child's effects before its parent's, and a flag raised in this
  // provider's effect would let one bearer-less round of requests out first.
  const [resumed, setResumed] = useState<string | null>(null);
  const unlocked = useRef<Set<string>>(new Set(session ? [keyOf(session)] : []));

  const ready = !client || !session || resumed === session.accessToken;

  const drop = useCallback((c: KromaClient | null) => {
    c?.setAuthToken();
    c?.setRefreshHandler();
    unlocked.current.clear();
    clearSession();
    setResumed(null);
    setSession(null);
  }, []);

  // The bearer is only applied when the session belongs to the server the client
  // points at: a token for server A must never ride a request to server B.
  useEffect(() => {
    if (!client) return;
    if (!session) {
      client.setAuthToken();
      client.setRefreshHandler();
      setResumed(null);
      return;
    }
    if (norm(session.serverUrl) !== norm(activeServerUrl)) {
      drop(client);
      return;
    }

    let cancelled = false;
    // One exchange for the boot and for a 401 alike: `sharedTokenExchange`
    // coalesces them, so a poster grid full of 401s cannot trip the
    // brute-force guard with N of them.
    const resume = (stored: StoredSession): Promise<string | undefined> =>
      sharedTokenExchange(() => client.accounts.exchangeToken(stored.accessToken))
        .then((res) => {
          if (cancelled) return undefined;
          client.setAuthToken(res.token);
          setSession((cur) => withUser(cur, res.user));
          saveSession({ ...stored, user: res.user });
          setResumed(stored.accessToken);
          return res.token as string | undefined;
        })
        .catch(() => {
          if (cancelled) return undefined;
          // Unresumable (revoked/expired token, or PIN required after a reset):
          // drop to the picker rather than a signed-in state with no bearer.
          drop(client);
          return undefined;
        });

    client.setRefreshHandler(() => resume(session));
    if (resumed !== session.accessToken) void resume(session);
    return () => {
      cancelled = true;
      client.setRefreshHandler();
    };
  }, [client, session, activeServerUrl, resumed, drop]);

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
    [setActiveServer],
  );

  const login = useCallback(
    (res: AuthResult, serverUrl: string) => {
      // Its bearer is already live, so the effect must not exchange it again.
      client?.setAuthToken(res.token);
      setResumed(res.accessToken);
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

  const switchProfile = useCallback(() => drop(client), [client, drop]);

  const forget = useCallback(
    (userId: UserId, serverUrl: string) => {
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
    [client],
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
  }, [client, session, drop]);

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
    [session],
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
