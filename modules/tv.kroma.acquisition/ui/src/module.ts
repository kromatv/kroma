import { defineModule } from '@kromatv/module-sdk';
import { lazy } from 'react';

const acquisitionModule = defineModule({
  pages: [
    {
      path: 'acquisition',
      component: lazy(() => import('./acquisition-page.component')),
      nav: {
        label: 'nav.acquisition',
        icon: 'magnet',
        section: 'acquisition',
        requires: 'settings.manage',
      },
    },
  ],
  slots: [
    {
      slot: 'library.upgrades',
      component: lazy(() =>
        import('./cutoff-view.component').then((m) => ({ default: m.CutoffView })),
      ),
    },
    {
      slot: 'requests.detail',
      component: lazy(() =>
        import('./request-search-panel.component').then((m) => ({ default: m.RequestSearchPanel })),
      ),
    },
    {
      slot: 'monitoring.detail',
      component: lazy(() =>
        import('./monitoring-panel.component').then((m) => ({ default: m.MonitoringPanel })),
      ),
    },
    {
      slot: 'monitoring.search',
      component: lazy(() =>
        import('./monitoring-search.component').then((m) => ({ default: m.MonitoringSearch })),
      ),
    },
  ],
});

export default acquisitionModule;
