import { createFileRoute } from '@tanstack/react-router';
import { ImportPage } from '#web/features/admin/import/import-page.component';
import { Denied, useCap } from '#web/features/admin/shell';

export const Route = createFileRoute('/admin/import')({
  component: AdminImport,
});

function AdminImport() {
  const canManage = useCap('settings.manage');
  if (!canManage) {
    return <Denied />;
  }
  return <ImportPage />;
}
