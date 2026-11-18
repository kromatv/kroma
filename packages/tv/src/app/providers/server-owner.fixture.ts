import { type AuthConfig, type AuthResult, UserId } from '@kromatv/client/accounts';

export const EMPTY_SERVER: AuthConfig = { publicUserList: true, hasAccounts: false };
export const OWNED_SERVER: AuthConfig = { publicUserList: true, hasAccounts: true };

export type AskConfig = () => Promise<AuthConfig>;

/** The answer of a server that cannot be reached: the request itself fails. */
export const unreachable = (): Promise<never> => Promise.reject(new TypeError('Failed to fetch'));

/** What a server hands a television that has just been paired, minted anew on
 * each call. */
export function pairedSession(): AuthResult {
  return {
    token: crypto.randomUUID(),
    accessToken: crypto.randomUUID(),
    user: {
      id: UserId.parse('u1'),
      email: 'alex@kroma.tv',
      username: 'Alex',
      permissions: [],
      createdAt: '2026-01-01T00:00:00Z',
      hasPin: false,
    },
  };
}
