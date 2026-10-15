import type { InviteToken, StoredSession, User, UserId } from '@kromatv/client/accounts';
import type { QueryClient } from '@kromatv/client/query';
import type { ActivateResult } from '@kromatv/ui';
import { createContext, useContext } from 'react';

export interface AuthValue {
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

export const AuthContext = createContext<AuthValue | null>(null);

/** Access the auth context. Throws if used outside `<AuthProvider>`. */
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
