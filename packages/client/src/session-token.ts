// The short-lived bearer obtained by exchanging the access token. Kept in
// memory only (never persisted) so a stolen localStorage dump can't be
// replayed as a live session.
let memorySessionToken: string | undefined;

/** The current in-memory session bearer, or undefined when not (yet) exchanged. */
export function sessionToken(): string | undefined {
  return memorySessionToken;
}

/** Set (or clear, with `undefined`) the in-memory session bearer. */
export function setSessionToken(token: string | undefined): void {
  memorySessionToken = token;
}

// The same handler `KromaClient.setRefreshHandler` holds, published here so
// anything that needs a fresh bearer reads ONE notion of how to get one. The
// event socket is the other caller: its refused handshake carries no readable
// 401, so it cannot go through the client's own 401 path.
let memorySessionRefresh: (() => Promise<string | undefined>) | undefined;

/** How to mint a fresh session bearer, or undefined when nothing registered one. */
export function sessionRefresh(): (() => Promise<string | undefined>) | undefined {
  return memorySessionRefresh;
}

/** Set (or clear, with `undefined`) how a fresh session bearer is minted.
 *  `KromaClient.setRefreshHandler` calls this; callers do not. */
export function setSessionRefresh(fn?: () => Promise<string | undefined>): void {
  memorySessionRefresh = fn;
}

/** The shape returned by a session-token exchange (`KromaClient.exchangeToken`). */
export interface TokenExchange<U = unknown> {
  token: string;
  user: U;
}

let inflightExchange: Promise<TokenExchange> | null = null;

/** Run `exchange` unless one is already in flight, in which case share it. Only
 * for the no-PIN boot/refresh exchange (a PIN-gated switch-in is a distinct user
 * action and must not coalesce with the ambient boot exchange). */
export function sharedTokenExchange<U>(
  exchange: () => Promise<TokenExchange<U>>,
): Promise<TokenExchange<U>> {
  if (inflightExchange) return inflightExchange as Promise<TokenExchange<U>>;
  const p = exchange().finally(() => {
    if (inflightExchange === p) inflightExchange = null;
  });
  inflightExchange = p as Promise<TokenExchange>;
  return p;
}
