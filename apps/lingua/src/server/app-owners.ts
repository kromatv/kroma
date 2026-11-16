import { z } from 'zod';
import { authorizeUrl, type Callback, grantFromCode, type OAuthCredentials } from '#site/github/oauth';
import type { AppOwner } from '#site/lib/views';
import { cookie, readCookie } from './session';

const OWNERS_COOKIE = 'lingua_owners';
const ONE_HOUR = 3600;
const MOST_OWNERS = 20;
const LOGIN = /^[A-Za-z0-9-]{1,39}$/;

/** What follows the token in the OAuth `state` of a trip listing where the App may be created. A sign-in carries its return path there, which starts with `/`. */
export const LISTING_OWNERS = 'owners';

const Membership = z.object({
  state: z.string(),
  role: z.string(),
  organization: z.object({ login: z.string().regex(LOGIN), avatar_url: z.string().optional() }),
});

type Membership = z.infer<typeof Membership>;

const Owners = z
  .array(
    z.object({
      login: z.string().regex(LOGIN),
      avatarUrl: z.string().startsWith('https://').nullable(),
      kind: z.enum(['user', 'organization']),
    }),
  )
  .max(MOST_OWNERS);

/** The organisations an account may create an App under: those it administers, membership accepted. */
export function adminOrganizations(memberships: readonly Membership[]): AppOwner[] {
  return memberships
    .filter((membership) => membership.state === 'active' && membership.role === 'admin')
    .map(({ organization }) => ({ login: organization.login, avatarUrl: organization.avatar_url ?? null, kind: 'organization' }));
}

/** Where to send the operator so GitHub lets Lingua read which organisations they belong to: `read:org`, nothing more. */
export function askForOwners(oauth: OAuthCredentials, at: { redirectUri: string; state: string }): string {
  return authorizeUrl(oauth, { ...at, scope: 'read:org' });
}

/**
 * Trade GitHub's code for the accounts the operator may create the App under:
 * their own first, then each organisation they administer. The token lives in
 * the client this reads with, and goes with it.
 */
export async function appOwners(oauth: OAuthCredentials, callback: Callback, fetchFn: typeof fetch = fetch): Promise<AppOwner[]> {
  const { user, gh } = await grantFromCode(oauth, callback, fetchFn);
  const memberships = await gh.get('/user/memberships/orgs?state=active&per_page=100', z.array(Membership));
  const own: AppOwner = { login: user.login, avatarUrl: user.avatarUrl, kind: 'user' };
  return [own, ...adminOrganizations(memberships)].slice(0, MOST_OWNERS);
}

const encoder = new TextEncoder();

const hmacKey = (secret: string) =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

const bytesOf = (text: string) => Uint8Array.from(text.match(/[0-9a-f]{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));

/** The `Set-Cookie` that hands `/setup` the listed owners for an hour, signed with `secret` so only this deployment wrote it. */
export async function ownersCookie(owners: readonly AppOwner[], secret: string): Promise<string> {
  const text = JSON.stringify(owners);
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(text));
  return cookie(OWNERS_COOKIE, `${hex(mac)} ${text}`, ONE_HOUR);
}

/** The owners this browser was handed, or none when the cookie is missing, expired or not signed with `secret`. */
export async function readOwners(cookieHeader: string | null | undefined, secret: string): Promise<AppOwner[]> {
  const held = readCookie(cookieHeader, OWNERS_COOKIE) ?? '';
  const space = held.indexOf(' ');
  if (space < 0) return [];
  const text = held.slice(space + 1);
  const signed = await crypto.subtle.verify('HMAC', await hmacKey(secret), bytesOf(held.slice(0, space)), encoder.encode(text));
  if (!signed) return [];
  try {
    return Owners.safeParse(JSON.parse(text)).data ?? [];
  } catch {
    return [];
  }
}
