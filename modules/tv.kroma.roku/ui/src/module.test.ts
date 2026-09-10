import { describe, expect, it } from 'vitest';
import { useRokuApi } from './api';
import rokuModule from './module';

describe('rokuModule', () => {
  it('takes its identity from the shared manifest and depends on nothing', () => {
    expect(rokuModule.id).toBe('tv.kroma.roku');
    expect(rokuModule.dependencies).toBeUndefined();
  });

  it('derives its nav link from the route it points at', () => {
    expect(rokuModule.routes?.map((r) => r.path)).toEqual(['roku']);
    expect(rokuModule.navItems).toEqual([
      {
        label: 'nav.roku',
        icon: 'tv',
        section: 'system',
        requires: 'settings.manage',
        to: '/admin/roku',
      },
    ]);
  });
});

describe('useRokuApi', () => {
  it('binds to whichever module the host is rendering rather than a written-down id', () => {
    expect(useRokuApi.name).toBe('useScopedModuleApi');
  });
});
