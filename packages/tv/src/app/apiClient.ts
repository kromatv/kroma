import {
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
import { nativeDevice } from '@kromatv/ui/kit';
import { buildInfo } from '#tv/app/clientBuild';

/** This television, as `clientUserAgent` wants it. `null` in a browser shell,
 * where the browser's own User-Agent is both better and unchangeable. */
export function tvIdentity(version = buildInfo().version): DeviceIdentity | null {
  const device = nativeDevice();
  return device ? { version, ...device } : null;
}

export function makeClient(
  baseUrl: string,
  version = buildInfo().version,
  artworkScale?: () => number,
  storage?: SessionStorage | null,
): KromaClient {
  const identity = tvIdentity(version);
  return createKromaClient({
    baseUrl,
    artworkScale,
    locale: deviceLocale(storage),
    ...(identity ? { userAgent: clientUserAgent(identity) } : {}),
  });
}
