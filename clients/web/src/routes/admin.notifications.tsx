// The notifications console: writing one and sending it, and what became of the
// pushes this server has already sent. Push delivery is automatic (a
// server-minted VAPID key for browsers, the relay for phones), so the composer
// reports the delivered count from the send itself, and the record below says
// what each device did with it.

import { useT } from '@kromatv/ui';
import { Box } from '@kromatv/ui/kit';
import { createFileRoute } from '@tanstack/react-router';
import { NotificationDeliveries } from '#web/features/admin/notification-deliveries';
import { NotificationBench } from '#web/features/admin/notifications-bench';
import { Denied, PageHeader, useCap } from '#web/features/admin/shell';

export const Route = createFileRoute('/admin/notifications')({
  component: NotificationsPage,
});

function NotificationsPage() {
  const t = useT();
  const canManage = useCap('settings.manage');
  if (!canManage) return <Denied />;

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.notificationsTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.notificationsSub')}</PageHeader.Subtitle>
      </PageHeader.Root>
      <Box gap={24}>
        <NotificationBench />
        <NotificationDeliveries />
      </Box>
    </>
  );
}
