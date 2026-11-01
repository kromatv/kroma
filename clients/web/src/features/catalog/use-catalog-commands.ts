import { useT } from '@kromatv/ui';
import { CATALOG_NAV } from '#web/features/catalog/catalog-nav';
import { useModuleNav } from '#web/modules/ModuleHostProvider';
import { resolveModuleIcon } from '#web/modules/module-icons';
import { useCommands } from '#web/shared/lib/command-menu';
import type { RoutePath } from '#web/shared/ui/route-link';

/** The catalogue's pages in the command menu, the same ones its sidebar draws. */
export function useCatalogCommands(): void {
  const t = useT();
  const modulePages = useModuleNav('library');
  const discover = t('nav.discover');
  const yourSpace = t('nav.yourSpace');
  const more = t('nav.more');

  useCommands([
    ...CATALOG_NAV.map(({ labelKey, icon, to }) => ({
      label: t(labelKey),
      group: discover,
      icon,
      to,
    })),
    { label: t('nav.myList'), group: yourSpace, icon: 'bookmark', to: '/my-list' },
    {
      label: t('nav.requests'),
      group: yourSpace,
      icon: 'inbox',
      cap: 'requests.create',
      to: '/requests',
    },
    ...modulePages.map(({ label, icon, to }) => ({
      label,
      group: yourSpace,
      icon: resolveModuleIcon(icon),
      to: to as RoutePath,
    })),
    {
      label: t('nav.connectDevice'),
      group: more,
      icon: 'device-desktop',
      keywords: 'tv pair television appairer',
      to: '/connect',
    },
    {
      label: t('nav.inviteUser'),
      group: more,
      icon: 'user-plus',
      cap: 'users.manage',
      to: '/invite',
    },
    {
      label: t('releases.title'),
      group: more,
      icon: 'sparkles',
      keywords: 'changelog release notes',
      to: '/whats-new',
    },
  ]);
}
