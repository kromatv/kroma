import { useAccountCommands } from '#web/features/accounts/use-account-commands';
import { useAdminCommands } from '#web/features/admin/use-admin-commands';
import { useCatalogCommands } from '#web/features/catalog/use-catalog-commands';
import { useLibrarySearchCommands } from '#web/features/catalog/use-library-search-commands';
import { CommandPalette } from '#web/shared/ui/command-palette';

/** The menu with what every feature offers, in the order it is listed. Lives apart
 *  from the entry, so those rows and the catalogs they name load only when wanted. */
export function CommandMenu() {
  useCatalogCommands();
  useAccountCommands();
  useAdminCommands();
  useLibrarySearchCommands();
  return <CommandPalette />;
}
