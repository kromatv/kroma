import { useT } from '@kromatv/ui';
import { Box, GuidedFlow, PageHeader } from '@kromatv/ui/kit';
import { KeptSignIns } from '#web/features/admin/import/import-kept-sign-ins.component';
import {
  ImportSession,
  useImportSession,
} from '#web/features/admin/import/import-session.component';
import { ImportStep } from '#web/features/admin/import/import-step.component';

function ImportFlow() {
  const t = useT();
  const { restart } = useImportSession();
  return (
    <Box h={{ base: 600, md: 720 }}>
      <GuidedFlow.Root label={t('admin.importTitle')}>
        <ImportStep onContinue={restart} />
      </GuidedFlow.Root>
    </Box>
  );
}

/** The import in the admin console, for an owner who set KROMA up first: the
 * same screens the setup runs, and the sign-ins earlier imports keep. */
export function ImportPage() {
  const t = useT();
  return (
    <Box gap={28}>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.importTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.importSub')}</PageHeader.Subtitle>
      </PageHeader.Root>
      <KeptSignIns />
      <ImportSession>
        <ImportFlow />
      </ImportSession>
    </Box>
  );
}
