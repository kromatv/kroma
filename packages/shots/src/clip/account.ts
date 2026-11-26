import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import { callApi, sendApi } from './api';
import { type AccountUser, LoginAnswer, MeAnswer, SessionAnswer } from './schemas';

/** How the sweep signs in: with an account's email or username and password,
 *  or with the session a seed file of localStorage entries holds. */
export type SignIn = { identifier: string; password: string } | { seed: string };

/** The account the sweep reads the screens as: the long-lived token a device
 *  keeps, a session token for the API, and the account as it reads now. */
export interface SweepAccount {
  server: string;
  accessToken: string;
  token: string;
  user: AccountUser;
  signedInHere: boolean;
}

const SeedEntries = z.object({ 'kroma.session': z.string().nonempty() });
const SeedSession = z.object({ accessToken: z.string().nonempty() });

const MISSING = 'Sign the sweep in: set KROMA_EMAIL and KROMA_PASSWORD, or pass --seed <file>.';

/** The sign-in a sweep was given: the seed file when there is one, else
 *  `KROMA_EMAIL` and `KROMA_PASSWORD` from the environment. */
export function signInFrom(
  env: Readonly<Record<string, string | undefined>>,
  seed?: string,
): SignIn {
  if (seed !== undefined) {
    return { seed };
  }
  const { KROMA_EMAIL: identifier, KROMA_PASSWORD: password } = env;
  if (!identifier || !password) {
    throw new Error(MISSING);
  }
  return { identifier, password };
}

/** The access token a seed file's `kroma.session` entry holds. */
export function seededAccessToken(entries: unknown): string {
  const session: unknown = JSON.parse(SeedEntries.parse(entries)['kroma.session']);
  return SeedSession.parse(session).accessToken;
}

function readSeed(seed: string): unknown {
  const base = process.cwd();
  const file = resolve(base, seed);
  if (!file.startsWith(`${base}${sep}`)) {
    throw new Error(`the seed file must sit under ${base}: ${seed}`);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function accessTokenOf(server: string, signIn: SignIn): Promise<string> {
  if ('seed' in signIn) {
    return seededAccessToken(readSeed(signIn.seed));
  }
  const body = JSON.stringify({ email: signIn.identifier, password: signIn.password });
  return (await callApi(`${server}/api/auth/login`, LoginAnswer, { method: 'POST', body }))
    .accessToken;
}

/** Signs in on `server` and opens a session for the API. */
export async function signInAccount(server: string, signIn: SignIn): Promise<SweepAccount> {
  const accessToken = await accessTokenOf(server, signIn);
  const body = JSON.stringify({ accessToken });
  const { token, user } = await callApi(`${server}/api/auth/token`, SessionAnswer, {
    method: 'POST',
    body,
  });
  return { server, accessToken, token, user, signedInHere: !('seed' in signIn) };
}

/** Sets the language of the account, which every shell reads ahead of the
 *  browser's, `null` to clear it, and returns the account as it reads then. */
export async function speak(account: SweepAccount, language: string | null): Promise<SweepAccount> {
  const { user } = await callApi(`${account.server}/api/auth/me`, MeAnswer, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ language }),
  });
  return { ...account, user };
}

/** Revokes the device token of an account the sweep signed in itself, and
 *  leaves one a seed file brought alone. */
export async function signOut(account: SweepAccount): Promise<void> {
  if (account.signedInHere) {
    await sendApi(`${account.server}/api/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${account.token}` },
      body: JSON.stringify({ accessToken: account.accessToken }),
    });
  }
}

/** The localStorage a web client or a TV shell boots signed in as `account` from. */
export function signedInStorage(account: SweepAccount): Record<string, string> {
  const session = {
    accessToken: account.accessToken,
    user: account.user,
    serverUrl: account.server,
  };
  return {
    'kroma.session': JSON.stringify(session),
    'kroma.accounts': JSON.stringify([session]),
    'kroma.servers': JSON.stringify([{ url: account.server, name: null, lastUsedAt: 1 }]),
  };
}
