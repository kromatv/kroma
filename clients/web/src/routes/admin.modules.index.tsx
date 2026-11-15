import { createFileRoute } from '@tanstack/react-router';
import { ModulesAdminPage } from '#web/features/admin/modules.component';

export const Route = createFileRoute('/admin/modules/')({
  component: ModulesAdminPage,
});
