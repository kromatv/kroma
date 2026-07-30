import { hasPermission } from '@kroma/core';
import { useT } from '@kroma/ui';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { GateLoading } from '#web/features/accounts/auth-gate';
import { AdminLayout } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { useRequireAuth } from '#web/shared/lib/require-auth';

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
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-[15px] text-muted">{t('admin.noAdminAccess')}</p>
      </main>
    );
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
