import { useT } from '@kromatv/ui';
import { CATALOG_NAV } from '#web/features/catalog/catalog-nav';
import { useModuleNav } from '#web/modules/ModuleHostProvider';
import { modulePageCommand } from '#web/modules/module-page-command';
import { useCommands } from '#web/shared/lib/command-menu';

/** The catalogue's pages in the command menu, the same ones its sidebar draws. */
export function useCatalogCommands(): void {
  const t = useT();
  const modulePages = useModuleNav('library');

  useCommands(
    CATALOG_NAV.map(({ labelKey, icon, to }) => ({ label: t(labelKey), icon, to })),
    { group: t('nav.discover') },
  );

  useCommands(
    [
      { label: t('nav.myList'), icon: 'bookmark', to: '/my-list' },
      { label: t('nav.requests'), icon: 'inbox', cap: 'requests.create', to: '/requests' },
      ...modulePages.map(modulePageCommand),
    ],
    { group: t('nav.yourSpace') },
  );

  useCommands(
    [
      {
        label: t('nav.connectDevice'),
        icon: 'device-desktop',
        keywords: 'tv pair television appairer',
        to: '/connect',
      },
      { label: t('nav.inviteUser'), icon: 'user-plus', cap: 'users.manage', to: '/invite' },
      {
        label: t('releases.title'),
        icon: 'sparkles',
        keywords: 'changelog release notes',
        to: '/whats-new',
      },
    ],
    { group: t('nav.more') },
  );
}
