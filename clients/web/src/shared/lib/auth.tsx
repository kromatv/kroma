// Client-side authentication context: one authed KromaClient plus the
// web-specific login, passkey and registration flows over `useAuthSession`.

import type { InviteToken, StoredSession, User, UserId } from '@kroma/client/accounts';
import { createQueryClient, type QueryClient } from '@kroma/client/query';
import { activeLocale } from '@kroma/core';
import { type ActivateResult, useAuthSession } from '@kroma/ui';
import { useRouter } from '@tanstack/react-router';
import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react';
import { apiBase } from '#web/shared/lib/api';
import { queryClient } from '#web/shared/lib/query';
import { getPasskey } from '#web/shared/lib/webauthn';

interface AuthValue {
  user: User | null;
  ready: boolean;
  client: QueryClient;
  accounts: StoredSession[];
  login: (email: string, password: string) => Promise<void>;
  loginPasskey: () => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string,
    avatar?: File | null,
    inviteToken?: InviteToken,
  ) => Promise<void>;
  activate: (s: StoredSession, pin?: string) => Promise<ActivateResult>;
  switchProfile: () => void;
  forget: (userId: UserId) => void;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const client = useMemo(
    () => createQueryClient({ baseUrl: apiBase(), locale: activeLocale() }),
    [],
  );
  const auth = useAuthSession(client);
  const router = useRouter();

  const login = useCallback(
    async (email: string, password: string) => {
      auth.apply(await client.accounts.login(email, password));
      void router.invalidate();
      void queryClient.invalidateQueries();
    },
    [client, auth, router],
  );

  const loginPasskey = useCallback(async () => {
    const { ceremonyId, options } = await client.accounts.passkeys.authStart();
    const credential = await getPasskey(options);
    auth.apply(await client.accounts.passkeys.authFinish({ ceremonyId, credential }));
    void router.invalidate();
    void queryClient.invalidateQueries();
  }, [client, auth, router]);

  const register = useCallback(
    async (
      email: string,
      username: string,
      password: string,
      avatar?: File | null,
      inviteToken?: InviteToken,
    ) => {
      const res = await client.accounts.register(email, username, password, inviteToken);
      auth.apply(res);
      if (avatar) {
        try {
          const { avatarUrl } = await client.accounts.uploadAvatar(avatar);
          auth.updateUser({ avatarUrl });
        } catch {
          /* avatar is optional keep the account without it */
        }
      }
      void router.invalidate();
      void queryClient.invalidateQueries();
    },
    [client, auth, router],
  );

  const activate = useCallback(
    async (s: StoredSession, pin?: string): Promise<ActivateResult> => {
      const res = await auth.activate(s, pin);
      if (res.ok) {
        void router.invalidate();
        void queryClient.invalidateQueries();
      }
      return res;
    },
    [auth, router],
  );

  const logout = useCallback(async () => {
    await auth.logout();
    // Every cached per-user entry must go, or it leaks into the next session.
    queryClient.clear();
  }, [auth]);

  const switchProfile = useCallback(() => {
    auth.switchProfile();
    queryClient.clear();
  }, [auth]);

  const value = useMemo<AuthValue>(
    () => ({
      user: auth.user,
      ready: auth.ready,
      client,
      accounts: auth.accounts,
      login,
      loginPasskey,
      register,
      activate,
      switchProfile,
      forget: auth.forget,
      logout,
      updateUser: auth.updateUser,
    }),
    [auth, client, login, loginPasskey, register, activate, logout, switchProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth context. Throws if used outside `<AuthProvider>`. */
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
