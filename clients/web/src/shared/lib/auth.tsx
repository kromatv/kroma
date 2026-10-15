// Client-side authentication context: one authed KromaClient plus the
// web-specific login, passkey and registration flows over `useAuthSession`.

import type { InviteToken, StoredSession } from '@kromatv/client/accounts';
import { createQueryClient } from '@kromatv/client/query';
import { activeLocale } from '@kromatv/core';
import { type ActivateResult, useAuthSession } from '@kromatv/ui';
import { useRouter } from '@tanstack/react-router';
import { type ReactNode, useCallback, useMemo } from 'react';
import { apiBase } from '#web/shared/lib/api';
import { AuthContext, type AuthValue } from '#web/shared/lib/auth-context';
import { queryClient } from '#web/shared/lib/query';
import { getPasskey } from '#web/shared/lib/webauthn';

export type { AuthValue } from '#web/shared/lib/auth-context';
export { useAuth } from '#web/shared/lib/auth-context';

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
