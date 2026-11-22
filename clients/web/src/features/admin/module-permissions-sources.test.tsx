// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AdminModule } from '#web/features/admin/module-api';
import { permissionGroups, type PermissionSource } from '#web/shared/lib/module-permissions';
import {
  addedAccess,
  consentOf,
  installedSource,
} from '#web/features/admin/module-permissions-sources';
import { declaredSource } from '#web/shared/lib/module-permissions-declared';
import { englishT } from '#web/shared/lib/module-permissions.fixture';

const t = englishT();

const BEFORE: PermissionSource = {
  permissions: {
    net: { connect: [{ purpose: 'metadata', to: ['api.themoviedb.org'] }] },
    fs: { read: ['media'] },
  },
  storage: { core: { read: ['users.email'] } },
  official: true,
};

const NOTHING: PermissionSource = { permissions: {} };

describe('declaredSource', () => {
  it('a declaration with storage and no permissions block still shows its storage', () => {
    const source = declaredSource({
      permissions: null,
      storage: { core: { read: ['users.email'], write: ['downloads'] } },
      settings: { read: ['namingCase'] },
      helpers: null,
    });

    expect(permissionGroups(source ?? NOTHING, t).map((g) => g.category)).toEqual([
      'accounts',
      'data',
      'settings',
    ]);
  });

  it('a declaration that says nothing is no source', () => {
    expect(
      declaredSource({ permissions: null, storage: {}, settings: null, helpers: null }),
    ).toBeNull();
  });
});

describe('installedSource', () => {
  it('an installed module with storage and no permissions block still shows its storage', () => {
    const source = installedSource({ storage: { core: { write: ['users'] } } });

    expect(permissionGroups(source ?? NOTHING, t).map((g) => [g.category, g.extended])).toEqual([
      ['accounts', true],
    ]);
  });
});

describe('addedAccess', () => {
  it('keeps only what the new version asks for on top of the old one', () => {
    const next: PermissionSource = {
      ...BEFORE,
      permissions: {
        net: {
          connect: [
            { purpose: 'metadata', to: ['api.themoviedb.org'] },
            { purpose: 'peers', to: ['public'] },
          ],
        },
        fs: { read: ['media'], write: ['downloads'] },
        run: ['rqbit'],
      },
      storage: { core: { read: ['users.email', 'users.username'] } },
    };

    const added = permissionGroups(addedAccess(next, BEFORE), t).map(({ category, brief }) => [
      category,
      brief,
    ]);

    expect(added).toEqual([
      ['run', 'Runs rqbit'],
      ['accounts', 'Username'],
      ['files', 'Downloads'],
      ['internet', 'Any website'],
    ]);
  });

  it('adds nothing when the new version asks for what the old one had', () => {
    expect(permissionGroups(addedAccess(BEFORE, BEFORE), t)).toEqual([]);
  });
});

describe('consentOf', () => {
  it('says only what an update adds, and keeps everything for the sheet', () => {
    const installed = [
      {
        id: 'tv.kroma.acquisition',
        permissions: BEFORE.permissions,
        storage: BEFORE.storage,
        origin: { official: true },
      },
    ] as unknown as AdminModule[];
    const row = {
      id: 'tv.kroma.acquisition',
      name: 'Acquisition',
      official: true,
      installedVersion: '0.4.20',
      permissions: { ...BEFORE.permissions, run: ['curl'] },
    };

    const consent = consentOf([row], row.id, installed);

    expect(consent.updating).toBe(true);
    expect(consent.unofficial).toBe(0);
    expect(
      permissionGroups(consent.entries[0]?.source ?? BEFORE, t).map((g) => g.category),
    ).toEqual(['run']);
    expect(permissionGroups(consent.sheet[0]?.source ?? BEFORE, t).map((g) => g.category)).toEqual([
      'run',
      'files',
      'internet',
    ]);
  });
});
