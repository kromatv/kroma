import type { Connection } from '#tv/app/providers/connection';

const noop = () => undefined;

/** A whole {@link Connection} for a test: a television with no server yet,
 * with the fields the test is about laid over it. */
export function connectionWith(fields: Partial<Connection> = {}): Connection {
  return {
    platform: 'TV',
    status: 'ready',
    servers: [],
    activeServerUrl: null,
    activeServerName: null,
    error: '',
    online: true,
    serverVersion: null,
    compat: 'ok',
    client: null,
    movies: [],
    shows: [],
    activity: null,
    discovering: false,
    discovered: [],
    deepLink: null,
    addServer: noop,
    setActiveServer: noop,
    discover: noop,
    forgetServer: noop,
    clearDeepLink: noop,
    ...fields,
  };
}
