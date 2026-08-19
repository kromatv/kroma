import { describe, expect, it } from 'vitest';
import { useTorrentsApi } from './api';
import { torrentsModule } from './index';

describe('torrentsModule', () => {
  it('takes its identity and its dependencies from the shared manifest', () => {
    expect(torrentsModule.id).toBe('tv.kroma.torrents');
    expect(torrentsModule.dependencies).toEqual({ 'tv.kroma.indexer': '^0.1.0' });
    expect(torrentsModule.optionalDependencies).toEqual({ 'tv.kroma.vpn': '^0.1.0' });
  });

  it('derives every nav link from the route it points at', () => {
    expect(torrentsModule.routes?.map((r) => r.path)).toEqual(['downloads', 'naming']);
    expect(torrentsModule.navItems?.map((n) => n.to)).toEqual([
      '/admin/downloads',
      '/admin/naming',
    ]);
  });

  it('files the two pages under the sidebar groups they belong to', () => {
    const sections = torrentsModule.navItems?.map((n) => n.section);
    expect(sections).toEqual(['acquisition', 'media']);
    expect(torrentsModule.navItems?.[1]?.requires).toBe('library.manage');
  });
});

describe('useTorrentsApi', () => {
  it('binds to whichever module the host is rendering rather than a written-down id', () => {
    expect(useTorrentsApi.name).toBe('useScopedModuleApi');
  });
});
