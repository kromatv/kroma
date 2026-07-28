// This device's LAN IPv4, used to pick a subnet to scan for servers.
//
// The whole shape of this module is a defence against ONE failure: expo-router
// imports every route at boot, so anything that throws at import time takes the
// app down before the first screen renders. expo-network is a native module, and
// a binary built before it was linked simply does not have it - so the require
// is lazy, guarded, and resolved once into a provider that is null when the
// module is absent.
//
// THAT is the path this file covers, and it covers it for real rather than by
// arrangement: under the test runner `require('expo-network')` genuinely fails,
// because the resolver reaches the package's TypeScript source and refuses it.
// So this runs the same code an unlinked binary runs.
//
// The other half - a device that HAS the module - is not reachable here. The
// require is CommonJS, resolved by the runtime rather than by the bundler, so
// neither `vi.mock` nor a global stub is in its path; a test asserting on it
// would be asserting on a provider that is null for a different reason, and
// would keep passing if the address handling were deleted outright. It is
// exercised on a device instead. What is left here is the guarantee that the
// import is survivable, which is the part that can break a launch.

import { describe, expect, it } from 'vitest';
import { getDeviceLocalIp } from './localIp';

describe('on a build where expo-network cannot be loaded', () => {
  it('imports without throwing', () => {
    // The import above already proved it. Stated as an assertion because this is
    // the entire reason the require is wrapped: a throw here is a phone that
    // does not start, not a feature that does not work.
    expect(getDeviceLocalIp).toBeTypeOf('function');
  });

  it('reports no address instead of failing', async () => {
    await expect(getDeviceLocalIp()).resolves.toBeNull();
  });

  it('keeps answering, rather than retrying a module it knows is absent', async () => {
    // The provider is resolved once at module scope; asking again must not
    // re-enter the failing require on every discovery sweep.
    await expect(getDeviceLocalIp()).resolves.toBeNull();
    await expect(getDeviceLocalIp()).resolves.toBeNull();
  });
});
