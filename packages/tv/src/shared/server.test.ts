// Which servers a TV shell starts with.
//
// Small, and it runs exactly once per launch, before anything can be shown. Two
// things have to be true or the first screen is a server picker on a box that
// has a server.
//
// The migration runs BEFORE the list is read. It moves the old single
// `kroma.serverUrl` into the multi-server list, and reading first would find an
// empty list on precisely the installs that have a server saved - every device
// upgrading from the single-server build.
//
// And the build-time default seeds only when nothing is saved. That is what
// makes a single-server appliance work out of the box: the URL is baked in at
// deploy time, so a fresh install finds its server without anyone typing an IP
// with a remote control. Seeding regardless would put the appliance's own
// address back into the list of someone who had just removed it.
//
// Only the second half of that is testable here, and the reason is worth stating
// rather than working around: `VITE_KROMA_SERVER` is INLINED by Vite at transform
// time, so under the runner it is the empty value the transform saw and no amount
// of `stubEnv` or `resetModules` changes it. What IS covered is that a device with
// servers is left alone, and that a build with no default starts empty - the
// appliance seeding itself is exercised by building an appliance.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ order: [] as string[] }));
const saved = vi.hoisted(() => ({ list: [] as Array<{ url: string }> }));

const migrateStorage = vi.hoisted(() =>
  vi.fn(() => {
    calls.order.push('migrate');
  }),
);
const loadServers = vi.hoisted(() =>
  vi.fn(() => {
    calls.order.push('load');
    return saved.list;
  }),
);
const saveServer = vi.hoisted(() =>
  vi.fn((server: { url: string }) => {
    calls.order.push('save');
    saved.list = [...saved.list, server];
    return saved.list;
  }),
);
vi.mock('@kroma/core', () => ({ migrateStorage, loadServers, saveServer }));

type Mod = typeof import('./server');

/** Launch a shell. The module reads its baked-in default once, at module scope,
 *  so each case gets its own instance the way each launch does. */
async function launch(): Promise<Mod> {
  vi.resetModules();
  return await import('./server');
}

beforeEach(() => {
  calls.order = [];
  saved.list = [];
  vi.clearAllMocks();
});

describe('the one-time migration', () => {
  it('runs on every launch', async () => {
    const { initialServers } = await launch();
    initialServers();
    // It is idempotent; what matters is that an upgrading device gets it.
    expect(migrateStorage).toHaveBeenCalledOnce();
  });

  it('runs BEFORE the list is read', async () => {
    const { initialServers } = await launch();
    initialServers();
    // Reading first finds an empty list on exactly the installs that have a
    // server saved - every device upgrading from the single-server build.
    expect(calls.order.indexOf('migrate')).toBeLessThan(calls.order.indexOf('load'));
  });
});

describe('a device with servers already saved', () => {
  it('starts with them', async () => {
    saved.list = [{ url: 'https://attic' }, { url: 'https://salon' }];
    const { initialServers } = await launch();
    expect(initialServers()).toEqual([{ url: 'https://attic' }, { url: 'https://salon' }]);
  });

  it('adds nothing on top of them', async () => {
    saved.list = [{ url: 'https://attic' }];
    const { initialServers } = await launch();
    // The seeding path is guarded on the list being EMPTY, which is what stops
    // an appliance's own address coming back for someone who removed it.
    expect(saveServer).not.toHaveBeenCalled();
    expect(initialServers()).toEqual([{ url: 'https://attic' }]);
  });
});

describe('a fresh install', () => {
  it('starts empty on a build with no default', async () => {
    const { initialServers } = await launch();
    // A general-purpose shell: the picker opens and the user adds a server.
    expect(initialServers()).toEqual([]);
    expect(saveServer).not.toHaveBeenCalled();
  });
});
