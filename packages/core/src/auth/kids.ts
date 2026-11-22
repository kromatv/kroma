import { type KidsProfile, normalizeServerUrl } from '@kromatv/client/accounts';
import type { NewKidsProfile } from '@kromatv/client/admin';

/** The levels a Kids profile is made at, youngest first (ACCT-123). */
export const KIDS_LEVELS: readonly NewKidsProfile['level'][] = [0, 7, 10];

/** What a Kids profile form holds: a level is picked by the admin, never in
 *  advance. */
export interface KidsForm {
  name: string;
  level: NewKidsProfile['level'] | null;
}

/** The profile a Kids form asks the server for, granted every library, or
 *  `null` while it has no name or no level. */
export function kidsDraft({ name, level }: KidsForm): NewKidsProfile | null {
  const username = name.trim();
  return username && level !== null ? { username, level, libraries: null } : null;
}

/** What the Kids rules read of an account remembered on a device. */
export interface RememberedAccount {
  serverUrl?: string;
  accessToken: string;
  user: { id: string; permissions?: readonly string[] };
}

/** The Kids profiles one server lets this device open, and the access token of
 *  the member whose ask was answered (ACCT-126). */
export interface ServerKids {
  serverUrl: string;
  access: string;
  profiles: KidsProfile[];
}

/** A Kids profile the picker offers as a tile of its own: one the device has
 *  not remembered yet, opened with `access` on `serverUrl`. */
export interface KidsChoice {
  serverUrl: string;
  access: string;
  profile: KidsProfile;
}

/** Asks each server a member is remembered on for its Kids profiles, with
 *  every member there at once, and keeps the first one answered. A server
 *  that answers none of them lists nothing. */
export async function kidsOnDevice(
  accounts: readonly RememberedAccount[],
  list: (serverUrl: string, access: string) => Promise<KidsProfile[]>,
): Promise<ServerKids[]> {
  const asked = [...byServer(accounts)].map(([serverUrl, members]) =>
    firstAnswered(serverUrl, members, list),
  );
  const found = await Promise.all(asked);
  return found.filter((server): server is ServerKids => server !== null);
}

/** The Kids profiles in `found` that no remembered account already is. */
export function kidsToOffer(
  found: readonly ServerKids[],
  accounts: readonly RememberedAccount[],
): KidsChoice[] {
  const remembered = new Set(accounts.map(keyOf));
  return found.flatMap(({ serverUrl, access, profiles }) =>
    profiles
      .filter((profile) => !remembered.has(keyOf({ serverUrl, user: profile })))
      .map((profile) => ({ serverUrl, access, profile })),
  );
}

/** Whether a remembered account is one of the Kids profiles in `found`, so
 *  its tile carries the Kids mark. */
export function isKidsAccount(found: readonly ServerKids[], account: RememberedAccount): boolean {
  const key = keyOf(account);
  return found.some(({ serverUrl, profiles }) =>
    profiles.some((profile) => keyOf({ serverUrl, user: profile }) === key),
  );
}

/** The member signed in here through whom a picker adds a Kids profile: the
 *  first remembered account that manages users, `null` without one (ACCT-135). */
export function kidsDoor<A extends RememberedAccount>(accounts: readonly A[]): A | null {
  return accounts.find((account) => account.user.permissions?.includes('users.manage')) ?? null;
}

function keyOf(account: { serverUrl?: string; user: { id: string } }): string {
  return `${normalizeServerUrl(account.serverUrl)}|${account.user.id}`;
}

function byServer(accounts: readonly RememberedAccount[]): Map<string, RememberedAccount[]> {
  const servers = new Map<string, RememberedAccount[]>();
  for (const account of accounts) {
    const url = normalizeServerUrl(account.serverUrl);
    servers.set(url, [...(servers.get(url) ?? []), account]);
  }
  return servers;
}

async function firstAnswered(
  serverUrl: string,
  members: readonly RememberedAccount[],
  list: (serverUrl: string, access: string) => Promise<KidsProfile[]>,
): Promise<ServerKids | null> {
  const answers = await Promise.allSettled(members.map((m) => list(serverUrl, m.accessToken)));
  const index = answers.findIndex((answer) => answer.status === 'fulfilled');
  const answer = answers[index];
  const member = members[index];
  if (answer?.status !== 'fulfilled' || !member) {
    return null;
  }
  return { serverUrl, access: member.accessToken, profiles: answer.value };
}
