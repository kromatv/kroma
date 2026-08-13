import { defineModule } from '@kroma/module-sdk';
import { lazy } from 'react';

// The Acquisition module, frontend half: a settings view plus the release-search
// half of the core's request page, contributed through the `requests.detail`
// slot. The console renders the slot by name and never imports this package;
// disabling the module takes the nav, the page AND the search panel with it.
export const acquisitionModule = defineModule({
  pages: [
    {
      path: 'acquisition',
      component: lazy(() => import('./AcquisitionPage')),
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
      slot: 'requests.detail',
      component: lazy(() =>
        import('./request-search-panel').then((m) => ({ default: m.RequestSearchPanel })),
      ),
    },
  ],
});
