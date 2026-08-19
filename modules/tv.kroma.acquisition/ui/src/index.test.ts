import { describe, expect, it } from 'vitest';
import { useAcquisitionApi } from './api';
import { acquisitionModule } from './index';

describe('acquisitionModule', () => {
  it('takes its identity and its dependency from the shared manifest', () => {
    expect(acquisitionModule.id).toBe('tv.kroma.acquisition');
    expect(acquisitionModule.dependencies).toEqual({ 'tv.kroma.torrents': '^0.1.0' });
  });

  it('derives its nav link from the route it points at', () => {
    expect(acquisitionModule.routes?.map((r) => r.path)).toEqual(['acquisition']);
    expect(acquisitionModule.navItems).toEqual([
      {
        label: 'nav.acquisition',
        icon: 'magnet',
        section: 'acquisition',
        requires: 'settings.manage',
        to: '/admin/acquisition',
      },
    ]);
  });
});

describe('useAcquisitionApi', () => {
  it('binds an explicit id, because the torrents module calls this API too', () => {
    expect(useAcquisitionApi.name).toBe('useBoundModuleApi');
  });
});
