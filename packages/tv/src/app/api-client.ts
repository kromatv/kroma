import {
  type AppIdentity,
  clientUserAgent,
  createKromaClient,
  type DeviceIdentity,
  type KromaClient,
  type SessionStorage,
} from '@kromatv/client';
// The API client, and the identity it presents. Native shells send a
// User-Agent that names nothing (`KROMA/1 CFNetwork/…`, `okhttp/4.12.0`), so a
// television would otherwise list itself as an unknown desktop.

import { deviceLocale } from '@kromatv/core';
import { mediaFollowsDirectRoute, withLocalAddressSpace } from '@kromatv/ui';
import { nativeDevice } from '@kromatv/ui/kit';
import { buildInfo } from '#tv/app/client-build';

/** This television, as `clientUserAgent` wants it. `null` in a browser shell,
 * where the browser's own User-Agent is both better and unchangeable. */
export function tvIdentity(version = buildInfo().version): DeviceIdentity | null {
  const device = nativeDevice();
  return device ? { version, ...device } : null;
}

export interface ClientOptions {
  shell?: string;
  version?: string;
  artworkScale?: () => number;
  storage?: SessionStorage | null;
}

/** A client for `baseUrl` that names this television on every request: the
 * hardware in its User-Agent, and the app in `X-Kroma-Client` when `shell`
 * says which one it is. */
export function makeClient(baseUrl: string, options: ClientOptions = {}): KromaClient {
  const { shell, version = buildInfo().version, artworkScale, storage } = options;
  const identity = tvIdentity(version);
  return createKromaClient({
    baseUrl,
    directMedia: mediaFollowsDirectRoute(),
    fetch: withLocalAddressSpace(globalThis.fetch.bind(globalThis)),
    artworkScale,
    locale: deviceLocale(storage),
    ...(identity ? { userAgent: clientUserAgent(identity) } : {}),
    ...(shell ? { app: { shell, version } satisfies AppIdentity } : {}),
  });
}
