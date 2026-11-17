import type { Store, User } from '#site/store/store';

const SESSION = '__Host-lingua_session';
const DAYS_30 = 30 * 24 * 60 * 60;

function decoded(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** One cookie's value off a `Cookie` header, or null when it is absent or not percent-encoded text. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decoded(rest.join('='));
  }
  return null;
}

/**
 * A `Set-Cookie` value, always HttpOnly, Secure and same-site. `maxAge` 0
 * clears it. Name it `__Host-…`: with `Path=/` and no `Domain`, a browser then
 * only takes it from this host, never from a sibling subdomain.
 */
export function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/** 32 random bytes, URL-safe. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCodePoint(...bytes))
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

async function hashOf(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Who the session cookie on a request belongs to, or null. Only the token's hash is ever stored. */
export async function viewerOf(
  store: Store,
  cookieHeader: string | null | undefined,
  now: number,
): Promise<User | null> {
  const token = readCookie(cookieHeader, SESSION);
  return token ? store.sessionUser(await hashOf(token), now) : null;
}

/** Sign `user` in for thirty days, returning the cookie that carries the session. */
export async function openSession(store: Store, user: User, now: number): Promise<string> {
  const token = randomToken();
  await store.upsertUser(user, now);
  await store.createSession(await hashOf(token), user.id, now + DAYS_30);
  return cookie(SESSION, token, DAYS_30);
}

/** End the session a request carries, returning the cookie that clears it. */
export async function closeSession(
  store: Store,
  cookieHeader: string | null | undefined,
): Promise<string> {
  const token = readCookie(cookieHeader, SESSION);
  if (token) await store.deleteSession(await hashOf(token));
  return cookie(SESSION, '', 0);
}
