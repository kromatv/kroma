// How this phone names itself to a server.
//
// Two lists on the account page are drawn from it: the push subscription's
// device column, and "active sessions", which reads the User-Agent captured when
// the device signed in. iOS sends `KROMA/1 CFNetwork/… Darwin/…` when nobody
// sets one and Android `okhttp/4.12.0` - neither names a device or a platform,
// so every signed-in phone listed itself as an unknown desktop. The shape of the
// replacement is @kroma/client's (`clientUserAgent`), shared with the TV app;
// what this file adds is where a PHONE reads its own hardware from.

import { clientUserAgent, KromaClient } from '@kroma/core';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { buildInfo } from '#mobile/lib/buildInfo';

/** A human label for this device: the name its owner gave it when that says more
 * than the model does (iOS only hands over the real one to an entitled app, and
 * answers "iPhone" otherwise), else the model. */
export function deviceLabel(): string {
  const name = Device.deviceName?.trim();
  const model = Device.modelName ?? Platform.OS;
  return name && name !== model ? `${name} (${model})` : model;
}

/** This app naming itself. The model rather than `deviceLabel()` - two phones on
 * one account are told apart by their hardware, and the owner's name for a
 * device is theirs, not a server's. */
export function userAgent(): string {
  return clientUserAgent({
    version: buildInfo.version,
    model: Device.modelName?.trim() || Platform.OS,
    os: [Device.osName, Device.osVersion].filter(Boolean).join(' ') || Platform.OS,
  });
}

const UA = userAgent();

/** A client for `baseUrl` that identifies this phone on every request. */
export function makeClient(baseUrl: string): KromaClient {
  return new KromaClient({ baseUrl, userAgent: UA });
}
