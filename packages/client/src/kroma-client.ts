import { domains } from './api/discover';
import { bindDomains, type Domains } from './core/client';
import {
  createRequestContext,
  type KromaClientOptions,
  preconnect,
  type TransportConfig,
  withUserAgent,
} from './core/http';
import { createSessionScope, type SessionScope } from './core/session';

/** What the client carries beyond its domains: the bearer, the locale, and the
 * few things a platform needs to reach the server without the transport. */
export interface ClientControls {
  readonly baseUrl: string;
  readonly session: SessionScope;
  readonly locale: string | undefined;
  /** Adopt a session bearer for this client, or clear it with `undefined`.
   * Bind event sockets explicitly to this client’s `sessionToken` getter. */
  setAuthToken(token?: string): void;
  /** When set, a 401 on a `bearer` endpoint triggers one refresh + retry before
   * the error surfaces. */
  setRefreshHandler(fn?: () => Promise<string | undefined>): void;
  /** Mints a fresh bearer through the registered refresh handler and adopts it,
   * resolving undefined when there is no handler or the session is
   * unrecoverable. Also serves the event socket, whose refused handshake carries
   * no readable 401 but needs the same one notion of "get me a fresh bearer". */
  refreshSession(): Promise<string | undefined>;
  /** Sent as `Accept-Language`; the server localises admin labels and error
   * messages to match. */
  setLocale(locale?: string): void;
  /** Whether a bearer token is currently set (does not validate it). */
  readonly hasAuth: boolean;
  /** For the one caller that cannot send a header: the event socket, which
   * carries it as a subprotocol. */
  readonly sessionToken: string | undefined;
  /** For requests that bypass the transport because the platform owns the
   * socket (the native downloader behind `media.downloadUrl`). A media-element
   * URL needs nothing here: `media.streamUrl` and its siblings carry the
   * account's media ticket in the URL instead, because a `<video>` cannot send
   * a header. */
  authHeaders(): Record<string, string>;
}

/** The KROMA server, one namespace per domain: `client.media.items()`,
 * `client.admin.backup.export()`, `client.accounts.passkeys.list()`. Every
 * namespace is a table of endpoints over one shared transport, which owns the
 * bearer, the locale and the schema parse. */
export type KromaClient = Domains & ClientControls;

/** The two halves a client is made of: the transport its domains fetch through,
 * and the members that are not a domain. Exported so `@kromatv/client/query` can
 * build a client AND a second context over the same bearer and locale. */
export function kromaClientParts(options: KromaClientOptions): {
  config: TransportConfig;
  controls: ClientControls;
} {
  const baseUrl = options.baseUrl.replace(/(^|[^/])\/+$/, '$1');
  const base = options.fetch ?? globalThis.fetch.bind(globalThis);
  const session = createSessionScope();
  session.setSessionToken(options.authToken);
  const { sessionMediaTicket, setSessionMediaTicket, setSessionToken } = session;
  let locale = options.locale;
  let refreshHandler: (() => Promise<string | undefined>) | undefined;

  const setAuthToken = (token?: string): void => {
    if (!token) setSessionMediaTicket(undefined);
    setSessionToken(token);
  };

  const refreshSession = async (): Promise<string | undefined> => {
    const token = await refreshHandler?.();
    if (token) setAuthToken(token);
    return token;
  };

  const config: TransportConfig = {
    baseUrl,
    fetchFn: options.userAgent ? withUserAgent(base, options.userAgent) : base,
    token: session.sessionToken,
    locale: () => locale,
    artworkScale: options.artworkScale,
    refresh: refreshSession,
    mediaTicket: sessionMediaTicket,
    setMediaTicket: setSessionMediaTicket,
  };
  preconnect(baseUrl);

  const controls: ClientControls = {
    baseUrl,
    session,
    get locale() {
      return locale;
    },
    setAuthToken,
    refreshSession,
    setRefreshHandler(fn) {
      refreshHandler = fn;
    },
    setLocale(next) {
      locale = next;
    },
    get hasAuth() {
      return Boolean(session.sessionToken());
    },
    get sessionToken() {
      return session.sessionToken();
    },
    authHeaders(): Record<string, string> {
      const token = session.sessionToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
  };

  return { config, controls };
}

/** One client over one transport. The controls are copied by DESCRIPTOR, not
 * spread: `hasAuth` and `sessionToken` are getters, and a spread would freeze
 * them at the value they had when the client was built. */
export function assembleClient(config: TransportConfig, controls: ClientControls): KromaClient {
  const client = bindDomains(createRequestContext(config), domains);
  return Object.defineProperties(client, Object.getOwnPropertyDescriptors(controls)) as KromaClient;
}

export function createKromaClient(options: KromaClientOptions): KromaClient {
  const { config, controls } = kromaClientParts(options);
  return assembleClient(config, controls);
}
