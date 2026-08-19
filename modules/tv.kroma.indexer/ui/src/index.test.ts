import { describe, expect, it } from 'vitest';
import { useIndexerApi } from './api';
import { indexerModule } from './index';

describe('indexerModule', () => {
  it('takes its identity from the shared manifest and depends on nothing', () => {
    expect(indexerModule.id).toBe('tv.kroma.indexer');
    // The manifest declares no `dependencies` at all now that an empty one is
    // simply absent, rather than an empty array nothing reads.
    expect(indexerModule.dependencies).toBeUndefined();
  });

  it('derives its nav link from the route it points at', () => {
    expect(indexerModule.routes?.map((r) => r.path)).toEqual(['indexers']);
    expect(indexerModule.navItems).toEqual([
      {
        label: 'nav.indexers',
        icon: 'antenna',
        section: 'acquisition',
        requires: 'settings.manage',
        to: '/admin/indexers',
      },
    ]);
  });
});

describe('useIndexerApi', () => {
  it('binds to whichever module the host is rendering rather than a written-down id', () => {
    expect(useIndexerApi.name).toBe('useScopedModuleApi');
  });
});
