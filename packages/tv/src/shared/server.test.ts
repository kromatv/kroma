// Which servers a TV shell starts with, decided once per launch: the migration
// runs BEFORE the list is read (else an upgrading device with a saved server
// would see an empty list), and the build-time default only seeds when nothing
// is saved (else a removed appliance address would come back).
//
// `VITE_KROMA_SERVER` is inlined by Vite at transform time, so under the test
// runner it is always empty and no `stubEnv`/`resetModules` changes that. The
// appliance-seeding path itself is exercised by building an appliance; this
// file covers everything around it.

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

// The module reads its baked-in default once, at module scope, so each case
// needs its own fresh instance the way each real launch does.
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
