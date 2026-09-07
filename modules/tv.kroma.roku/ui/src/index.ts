import { defineModule } from '@kroma/module-sdk';
import { lazy } from 'react';

export const rokuModule = defineModule({
  pages: [
    {
      path: 'roku',
      component: lazy(() => import('./RokuPage')),
      nav: { label: 'nav.roku', icon: 'tv', section: 'system', requires: 'settings.manage' },
    },
  ],
});
