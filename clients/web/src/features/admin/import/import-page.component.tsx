import { useT } from '@kromatv/ui';
import { Box, PageHeader } from '@kromatv/ui/kit';
import { ImportConsole } from '#web/features/admin/import/import-console.component';
import { ImportSession } from '#web/features/admin/import/import-session.component';

/** The import in the admin console, for an owner who set KROMA up first: the
 * questions the setup asks, laid out for a page of the console, and the
 * sign-ins earlier imports keep. */
export function ImportPage() {
  const t = useT();
  return (
    <Box gap={28}>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.importTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.importSub')}</PageHeader.Subtitle>
      </PageHeader.Root>
      <ImportSession>
        <ImportConsole />
      </ImportSession>
    </Box>
  );
}
