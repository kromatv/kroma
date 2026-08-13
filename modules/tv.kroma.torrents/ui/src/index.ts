import { defineModule } from '@kroma/module-sdk';
import { lazy } from 'react';

// The Downloads module (frontend half). Its id, version and dependencies come
// from the shared module.json this also feeds the backend crate, so the two
// halves cannot drift. It contributes the full "Downloads" admin page (the live
// queue + download-clients section) into the Acquisition sidebar group, and the
// per-episode progress bar on the core request page; disabling the module
// removes the page, the bar, and 404s its backend routes together.
export const torrentsModule = defineModule({
  pages: [
    {
      path: 'downloads',
      component: lazy(() => import('./DownloadsPage')),
      nav: { label: 'nav.downloads', icon: 'download', section: 'acquisition' },
    },
    {
      path: 'naming',
      component: lazy(() => import('./NamingPage')),
      nav: {
        label: 'admin.navNaming',
        icon: 'file-text',
        section: 'media',
        requires: 'library.manage',
      },
    },
  ],
  slots: [
    {
      slot: 'requests.episode.progress',
      component: lazy(() =>
        import('./episode-progress').then((m) => ({ default: m.EpisodeProgress })),
      ),
    },
  ],
});
