import { hasPermission } from '@kroma/client/accounts';
import { useT } from '@kroma/ui';
import { Box, classes, Text } from '@kroma/ui/kit';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { GateLoading } from '#web/features/accounts/auth-gate';
import { AdminLayout } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { useRequireAuth } from '#web/shared/lib/require-auth';
import { page } from '#web/shared/ui';

// Any management capability unlocks the console; pages further gate their writes.
export const Route = createFileRoute('/admin')({
  component: AdminRoute,
});

function AdminRoute() {
  const t = useT();
  const { user } = useAuth();
  const { ready } = useRequireAuth();
  // `useRequireAuth` redirects signed-out users; the `user` check also narrows
  // it non-null for the checks below.
  if (!ready || !user) return <GateLoading />;

  const allowed =
    hasPermission(user, 'users.manage') ||
    hasPermission(user, 'library.manage') ||
    hasPermission(user, 'settings.manage') ||
    hasPermission(user, 'requests.manage');

  if (!allowed) {
    return (
      <main className={classes(page.screen)}>
        <Box flex center px={24}>
          <Text variant="body" color="textMuted">
            {t('admin.noAdminAccess')}
          </Text>
        </Box>
      </main>
    );
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
