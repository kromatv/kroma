import { defineModule } from '@kroma/module-sdk';
import { lazy } from 'react';

// The Acquisition module, frontend half: a settings view, so the backend is the
// shared settings endpoint and disabling the module hides the nav and the page.
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
});
