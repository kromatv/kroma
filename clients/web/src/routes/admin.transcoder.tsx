import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '#web/features/admin/settings.component';

export const Route = createFileRoute('/admin/transcoder')({
  component: () => (
    <SettingsPage
      view="transcoder"
      titleKey="admin.pageTranscoder"
      subtitleKey="admin.pageTranscoderSub"
    />
  ),
});
