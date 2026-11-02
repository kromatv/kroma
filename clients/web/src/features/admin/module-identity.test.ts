// @vitest-environment jsdom
import type { StoreModule } from '@kromatv/client/modules';
import type { MessageKey } from '@kromatv/i18n';
import { describe, expect, it } from 'vitest';
import type { AdminModule } from '#web/features/admin/module-api';
import { metaRowsFor } from '#web/features/admin/module-identity';

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
