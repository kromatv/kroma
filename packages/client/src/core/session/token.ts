/** The shape returned by a session-token exchange (`accounts.exchangeToken`). */
export interface TokenExchange<U = unknown> {
  token: string;
  mediaTicket?: string;
  user: U;
}

/** One client/server owner keeps credentials and coalesces only its own exchanges. */
export function createSessionScope() {
  // The short-lived bearer obtained by exchanging the access token. Kept in
  // memory only (never persisted) so a stolen localStorage dump can't be
  // replayed as a live session.
  let memorySessionToken: string | undefined;

  /** The current in-memory session bearer, or undefined when not (yet) exchanged. */
  function sessionToken(): string | undefined {
    return memorySessionToken;
  }

  /** Set (or clear, with `undefined`) the in-memory session bearer.
   *  `KromaClient.setAuthToken` calls this, so one call serves both. */
  function setSessionToken(token: string | undefined): void {
    memorySessionToken = token;
  }

  let memoryMediaTicket: string | undefined;

  /** The media ticket the last sign-in answered with. Owned with the bearer, so
   *  unrelated clients and servers cannot inherit it. */
  function sessionMediaTicket(): string | undefined {
    return memoryMediaTicket;
  }

  /** Set (or clear, with `undefined`) this owner's media ticket. The transport
   * updates it automatically; sign-in probes pass it explicitly to the active owner. */
  function setSessionMediaTicket(ticket: string | undefined): void {
    memoryMediaTicket = ticket;
  }

  let inflightExchange: Promise<TokenExchange> | null = null;

  /** Run `exchange` unless one is already in flight, in which case share it. Only
   * for the no-PIN boot/refresh exchange (a PIN-gated switch-in is a distinct user
   * action and must not coalesce with the ambient boot exchange). */
  function sharedTokenExchange<U>(
    exchange: () => Promise<TokenExchange<U>>,
  ): Promise<TokenExchange<U>> {
    if (inflightExchange) return inflightExchange as Promise<TokenExchange<U>>;
    const p = exchange().finally(() => {
      if (inflightExchange === p) inflightExchange = null;
    });
    inflightExchange = p as Promise<TokenExchange>;
    return p;
  }

  return {
    sessionToken,
    setSessionToken,
    sessionMediaTicket,
    setSessionMediaTicket,
    sharedTokenExchange,
  };
}
export type SessionScope = ReturnType<typeof createSessionScope>;
