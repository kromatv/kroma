import { domains } from './api/discover';
import { bindDomains, type Domains } from './core/client';
import {
  createRequestContext,
  type KromaClientOptions,
  preconnect,
  type TransportConfig,
  withUserAgent,
} from './core/http';
import { setSessionRefresh, setSessionToken } from './core/session';

/** What the client carries beyond its domains: the bearer, the locale, and the
 * few things a platform needs to reach the server without the transport. */
export interface ClientControls {
  readonly baseUrl: string;
  /** Adopt a session bearer, or clear it with `undefined`. Also publishes it to
   * the shared session module, so the event socket (which cannot send a header
   * and reads the bearer from there) follows without a second call. */
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
   * socket (the native downloader behind `media.downloadUrl`); media-element
   * URLs need nothing, since those routes are public because a `<video>` cannot
   * send a header. */
  authHeaders(): Record<string, string>;
}

/** The KROMA server, one namespace per domain: `client.media.items()`,
 * `client.admin.backup.export()`, `client.accounts.passkeys.list()`. Every
 * namespace is a table of endpoints over one shared transport, which owns the
 * bearer, the locale and the schema parse. */
export type KromaClient = Domains & ClientControls;

/** The two halves a client is made of: the transport its domains fetch through,
 * and the members that are not a domain. Exported so `@kroma/client/query` can
 * build a client AND a second context over the same bearer and locale. */
export function kromaClientParts(options: KromaClientOptions): {
  config: TransportConfig;
  controls: ClientControls;
} {
  const baseUrl = options.baseUrl.replace(/(^|[^/])\/+$/, '$1');
  const base = options.fetch ?? globalThis.fetch.bind(globalThis);
  let authToken = options.authToken;
  let locale = options.locale;
  let refreshHandler: (() => Promise<string | undefined>) | undefined;

  const setAuthToken = (token?: string): void => {
    authToken = token;
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
    token: () => authToken,
    locale: () => locale,
    refresh: refreshSession,
  };
  preconnect(baseUrl);

  const controls: ClientControls = {
    baseUrl,
    setAuthToken,
    refreshSession,
    setRefreshHandler(fn) {
      refreshHandler = fn;
      setSessionRefresh(fn && refreshSession);
    },
    setLocale(next) {
      locale = next;
    },
    get hasAuth() {
      return Boolean(authToken);
    },
    get sessionToken() {
      return authToken;
    },
    authHeaders(): Record<string, string> {
      return authToken ? { Authorization: `Bearer ${authToken}` } : {};
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
