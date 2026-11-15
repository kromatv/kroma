import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '#web/features/admin/settings.component';

export const Route = createFileRoute('/admin/general')({
  component: () => (
    <SettingsPage view="general" titleKey="admin.pageGeneral" subtitleKey="admin.pageGeneralSub" />
  ),
});
