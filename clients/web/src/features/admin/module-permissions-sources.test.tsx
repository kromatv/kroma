// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AdminModule } from '#web/features/admin/module-api';
import { permissionGroups, type PermissionSource } from '#web/features/admin/module-permissions';
import { addedAccess, consentOf } from '#web/features/admin/module-permissions-sources';
import { englishT } from '#web/features/admin/module-permissions.fixture';

const t = englishT();

const BEFORE: PermissionSource = {
  permissions: {
    net: { connect: [{ purpose: 'metadata', to: ['api.themoviedb.org'] }] },
    fs: { read: ['media'] },
  },
  storage: { core: { read: ['users.email'] } },
  official: true,
};

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
      ['disk', 'Can change every folder on the server'],
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
