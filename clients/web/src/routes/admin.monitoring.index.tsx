import { createFileRoute } from '@tanstack/react-router';
import { MonitoringListPage } from '#web/features/admin/monitoring-list';

export const Route = createFileRoute('/admin/monitoring/')({
  component: MonitoringListPage,
});
