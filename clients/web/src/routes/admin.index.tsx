import { createFileRoute } from '@tanstack/react-router';
import { DashboardScreen } from '#web/features/admin/dashboard.component';

export const Route = createFileRoute('/admin/')({
  component: DashboardScreen,
});
