import { defineModule } from '__SDK__';
import { lazy } from 'react';

export default defineModule({
  pages: [
    {
      path: '__SLUG__',
      component: lazy(() => import('./__PAGE__')),
      nav: {
        label: 'nav.__SLUG__',
        icon: 'puzzle',
        section: 'system',
        requires: 'settings.manage',
      },
    },
  ],
});
