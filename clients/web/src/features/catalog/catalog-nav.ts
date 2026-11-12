import type { MessageKey } from '@kromatv/i18n';
import type { IconName } from '@kromatv/ui/kit';
import type { RoutePath } from '#web/shared/ui/route-link';

/** One catalogue page in the rail's first group. */
export interface CatalogNavItem {
  labelKey: MessageKey;
  to: RoutePath;
  icon: IconName;
  exact?: boolean;
}

/** The catalogue's pages. The sidebar draws them, and the command menu lists them. */
export const CATALOG_NAV: readonly CatalogNavItem[] = [
  { labelKey: 'nav.home', to: '/', icon: 'home', exact: true },
  { labelKey: 'nav.search', to: '/search', icon: 'search' },
  { labelKey: 'nav.films', to: '/movies', icon: 'movie' },
  { labelKey: 'nav.series', to: '/shows', icon: 'device-tv' },
  { labelKey: 'nav.genres', to: '/genres', icon: 'category' },
];
