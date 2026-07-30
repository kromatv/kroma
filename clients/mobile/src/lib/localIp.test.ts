// Under the test runner, `require('expo-network')` genuinely fails (the
// resolver reaches the package's TypeScript source and refuses it), so this
// exercises the same path an unlinked binary runs. The module-present half is
// not reachable here: the require is CommonJS, so neither `vi.mock` nor a
// global stub is in it.

import { describe, expect, it } from 'vitest';
import { getDeviceLocalIp } from './localIp';

describe('on a build where expo-network cannot be loaded', () => {
  it('imports without throwing', () => {
    // expo-router imports every route at boot, so a throw here is a phone that
    // does not start.
    expect(getDeviceLocalIp).toBeTypeOf('function');
  });

  it('reports no address instead of failing', async () => {
    await expect(getDeviceLocalIp()).resolves.toBeNull();
  });

  it('keeps answering, rather than retrying a module it knows is absent', async () => {
    await expect(getDeviceLocalIp()).resolves.toBeNull();
    await expect(getDeviceLocalIp()).resolves.toBeNull();
  });
});
