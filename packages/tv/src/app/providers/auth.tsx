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
  setSessionToken,
  type User,
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

// The bearer has to reach both places: `KromaEvents` authenticates its WebSocket
// from the shared session module (a browser cannot set a header on a handshake,
// so the bearer rides as a subprotocol), not from the client.
function applyBearer(client: KromaClient | null, token?: string): void {
  client?.setAuthToken(token);
  setSessionToken(token);
}

interface Auth {
  session: StoredSession | null;
  user: User | null;
  accounts: StoredSession[];
  login: (res: AuthResult, serverUrl: string) => void;
  activate: (account: StoredSession) => void;
  switchProfile: () => void;
  forget: (userId: string, serverUrl: string) => void;
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
  const unlocked = useRef<Set<string>>(new Set(session ? [keyOf(session)] : []));
  // The access token already exchanged for a bearer: the success path mints a
  // new `session`, which would otherwise re-run the effect forever.
  const exchangedRef = useRef<string | null>(null);
  // Coalesce concurrent silent refreshes: a poster grid full of 401s must cause
  // one exchange, not N, which would trip the brute-force guard.
  const refreshingRef = useRef<Promise<string | undefined> | null>(null);

  // The bearer is only applied when the session belongs to the server the client
  // points at: a token for server A must never ride a request to server B.
  useEffect(() => {
    if (!client) return;
    const match = session && norm(session.serverUrl) === norm(activeServerUrl);
    if (!match || !session) {
      applyBearer(client);
      client.setRefreshHandler();
      exchangedRef.current = null;
      return;
    }
    client.setRefreshHandler(() => {
      if (refreshingRef.current) return refreshingRef.current;
      const s = loadSession();
      if (!s) return Promise.resolve(undefined);
      const p = client
        .exchangeToken(s.accessToken)
        .then((r) => r.token as string | undefined)
        .catch(() => undefined)
        .finally(() => {
          refreshingRef.current = null;
        });
      refreshingRef.current = p;
      return p;
    });

    if (exchangedRef.current === session.accessToken) {
      return () => client.setRefreshHandler();
    }
    exchangedRef.current = session.accessToken;

    let cancelled = false;
    client
      .exchangeToken(session.accessToken)
      .then((res) => {
        if (cancelled) return;
        applyBearer(client, res.token);
        setSession((cur) => (cur?.user.id === res.user.id ? { ...cur, user: res.user } : cur));
        saveSession({ ...session, user: res.user });
      })
      .catch(() => {
        if (cancelled) return;
        // Unresumable (revoked/expired token, or PIN required after a reset):
        // drop to the picker rather than a signed-in state with no bearer.
        applyBearer(client);
        exchangedRef.current = null;
        unlocked.current.clear();
        clearSession();
        setSession(null);
      });
    return () => {
      cancelled = true;
      client.setRefreshHandler();
    };
  }, [client, session, activeServerUrl]);

  useEffect(() => {
    onSignedInChange(Boolean(session));
  }, [session, onSignedInChange]);

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
      // Marked as already-exchanged so the effect does not re-exchange it.
      applyBearer(client, res.token);
      exchangedRef.current = res.accessToken;
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
    applyBearer(client);
    clearSession();
    unlocked.current.clear();
    setSession(null);
  }, [client]);

  const forget = useCallback(
    (userId: string, serverUrl: string) => {
      forgetAccountStore(userId, serverUrl);
      setAccounts(loadAccounts());
      setSession((s) => {
        if (s?.user.id === userId && norm(s?.serverUrl) === norm(serverUrl)) {
          applyBearer(client);
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
      await client?.logout(active?.accessToken);
    } catch {
      /* best-effort server-side revocation */
    }
    applyBearer(client);
    if (active?.serverUrl) forgetAccountStore(active.user.id, active.serverUrl);
    else clearSession();
    unlocked.current.clear();
    setAccounts(loadAccounts());
    setSession(null);
  }, [client, session]);

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
      login,
      activate,
      switchProfile,
      forget,
      logout,
      updateUser,
      isUnlocked,
    }),
    [session, accounts, login, activate, switchProfile, forget, logout, updateUser, isUnlocked],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>');
  return ctx;
}
