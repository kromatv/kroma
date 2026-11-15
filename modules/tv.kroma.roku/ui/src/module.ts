import { defineModule } from '@kromatv/module-sdk';
import { lazy } from 'react';

const rokuModule = defineModule({
  pages: [
    {
      path: 'roku',
      component: lazy(() => import('./roku-page.component')),
      nav: { label: 'nav.roku', icon: 'tv', section: 'system', requires: 'settings.manage' },
    },
  ],
});

export default rokuModule;
