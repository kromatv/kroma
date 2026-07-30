// The API client, and the identity it presents. Native shells send a
// User-Agent that names nothing (`KROMA/1 CFNetwork/…`, `okhttp/4.12.0`), so a
// television would otherwise list itself as an unknown desktop.

import { clientUserAgent, type DeviceIdentity, KromaClient } from '@kroma/core';
import { Platform } from 'react-native';
import { buildInfo } from '#tv/app/clientBuild';

/** This television, as `clientUserAgent` wants it. `null` in a browser shell,
 * where the browser's own User-Agent is both better and unchangeable. */
export function tvIdentity(): DeviceIdentity | null {
  const version = buildInfo().version;
  if (Platform.OS === 'ios') {
    // tvOS exposes no model API without a native module.
    const { systemName, osVersion } = Platform.constants;
    return {
      version,
      model: Platform.isTV ? 'Apple TV' : 'Apple device',
      os: `${systemName} ${osVersion}`,
    };
  }
  if (Platform.OS === 'android') {
    const { Model, Release, uiMode } = Platform.constants;
    return { version, model: Model, os: `Android${uiMode === 'tv' ? ' TV' : ''} ${Release}` };
  }
  return null;
}

export function makeClient(baseUrl: string): KromaClient {
  const identity = tvIdentity();
  return new KromaClient({
    baseUrl,
    ...(identity ? { userAgent: clientUserAgent(identity) } : {}),
  });
}
