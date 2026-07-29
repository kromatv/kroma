// The notifications console: writing one and sending it. That is the whole page.
//
// It used to carry a delivery section underneath — first seven credential
// inputs, then three read-only status lines once it became clear no operator
// could fill those inputs in. Both are gone, because push is now genuinely
// automatic: browsers work off a VAPID key the server mints itself, and phones
// are reached through the relay, which every server can use without holding
// anything. There is no question left for an admin to answer, and a panel that
// only ever says "fine" is a panel that teaches people to stop reading.
//
// What replaced it as the answer to "did that reach anyone?" is better anyway:
// the composer reports the delivered count from the send itself.

import { useT } from '@kroma/ui';
import { createFileRoute } from '@tanstack/react-router';
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
      <PageHeader title={t('admin.notificationsTitle')} subtitle={t('admin.notificationsSub')} />
      <NotificationBench />
    </>
  );
}
