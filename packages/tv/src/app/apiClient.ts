// The API client this app talks to a server with, and the name it does so under.
//
// Every shell mounts the same @kroma/tv bundle, but they do not all own their
// User-Agent. A browser shell (Tizen, webOS, the Android TV webview, desktop)
// has one the browser writes and will not let a script change - which is fine,
// it names a browser and a platform. The NATIVE shell has one that names
// nothing: tvOS sends `KROMA/1 CFNetwork/… Darwin/…` and Android TV
// `okhttp/4.12.0`, so a signed-in television listed itself in the account's
// devices as an unknown desktop. React Native is what tells the two apart, so
// the identity is derived here rather than registered by the shell - unlike the
// mDNS browse or the microphone next door, nothing native is needed for it.

import { clientUserAgent, type DeviceIdentity, KromaClient } from '@kroma/core';
import { Platform } from 'react-native';
import { buildInfo } from '#tv/app/clientBuild';

/** This television, as `clientUserAgent` wants it. `null` in a browser shell,
 * where the browser's own User-Agent is both better and unchangeable. */
export function tvIdentity(): DeviceIdentity | null {
  const version = buildInfo().version;
  if (Platform.OS === 'ios') {
    // tvOS has no model API without a native module, and there is only one
    // shape of Apple television, so the idiom is the whole answer.
    const { systemName, osVersion } = Platform.constants;
    return {
      version,
      model: Platform.isTV ? 'Apple TV' : 'Apple device',
      os: `${systemName} ${osVersion}`,
    };
  }
  if (Platform.OS === 'android') {
    // Android names its hardware ("Chromecast", "BRAVIA 4K") and says outright
    // that it is running on a television, which the account page reads back as
    // a TV rather than as a very large phone.
    const { Model, Release, uiMode } = Platform.constants;
    return { version, model: Model, os: `Android${uiMode === 'tv' ? ' TV' : ''} ${Release}` };
  }
  return null;
}

/** A client for `baseUrl` that identifies this television on every request. */
export function makeClient(baseUrl: string): KromaClient {
  const identity = tvIdentity();
  return new KromaClient({
    baseUrl,
    ...(identity ? { userAgent: clientUserAgent(identity) } : {}),
  });
}
