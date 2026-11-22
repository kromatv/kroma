// @vitest-environment jsdom
import { StoreModule } from '@kromatv/client/modules';
import type { MessageKey } from '@kromatv/i18n';
import { describe, expect, it } from 'vitest';
import type { AdminModule } from '#web/features/admin/module-api';
import { identityOf, metaRowsFor } from '#web/features/admin/module-identity';

const key = (message: MessageKey): string => message;

function rowsOf(entry: Partial<StoreModule>) {
  const installed = { hasSidecar: true } as AdminModule;
  return new Map(metaRowsFor(key, installed, entry as StoreModule, false, '1.0.0'));
}

describe('metaRowsFor', () => {
  it('names the registry a module comes from', () => {
    const rows = rowsOf({ source: 'official' });

    expect(rows.get('admin.modulesSource')).toBe('official');
  });

  it('names the oldest server a module runs on', () => {
    const rows = rowsOf({ engines: { server: '>=0.1.39' } });

    expect(rows.has('admin.modulesMinServer')).toBe(true);
  });

  it('says nothing of a platform, since one bundle runs on every one', () => {
    const rows = rowsOf({});

    expect([...rows.keys()]).toEqual(['admin.modulesVersion']);
  });
});

const held = (manifest: Partial<AdminModule> = {}): AdminModule => ({
  id: 'tv.kroma.remote',
  name: 'Remote access',
  version: '0.3.32',
  description: 'Held on this server',
  enabled: true,
  configValues: {},
  removable: true,
  running: true,
  hasSidecar: true,
  ...manifest,
});

const listed = (row: Record<string, unknown> = {}) =>
  StoreModule.parse({
    id: 'tv.kroma.remote',
    name: 'Remote access (catalog)',
    version: '0.3.40',
    description: 'Listed in the catalog',
    translations: { fr: { name: 'Accès à distance' } },
    library: false,
    dependencies: {},
    optionalDependencies: {},
    contributes: [],
    consumes: [],
    updateAvailable: true,
    compatible: true,
    source: 'Official',
    ...row,
  });

describe('identityOf', () => {
  it('names a module by what the server holds over what the catalog says', () => {
    const identity = identityOf('tv.kroma.remote', held(), listed());

    expect(identity).toMatchObject({
      name: 'Remote access',
      version: '0.3.32',
      description: 'Held on this server',
    });
  });

  it('reads a module the server does not hold from the catalog', () => {
    const identity = identityOf('tv.kroma.remote', undefined, listed());

    expect(identity).toEqual({
      name: 'Remote access (catalog)',
      version: '0.3.40',
      description: 'Listed in the catalog',
      translations: { fr: { name: 'Accès à distance' } },
    });
  });

  it('takes from the catalog a word the installed manifest leaves out', () => {
    const identity = identityOf('tv.kroma.remote', held({ description: null }), listed());

    expect(identity.description).toBe('Listed in the catalog');
    expect(identity.translations).toEqual({ fr: { name: 'Accès à distance' } });
  });

  it('names a module neither knows by its id, with no description', () => {
    const identity = identityOf('tv.kroma.gone', undefined, undefined);

    expect(identity).toEqual({
      name: 'tv.kroma.gone',
      version: undefined,
      description: '',
      translations: undefined,
    });
  });
});
