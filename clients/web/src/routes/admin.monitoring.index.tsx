import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { LibraryState } from '#web/features/admin/monitoring-index-model';
import { MonitoringListPage } from '#web/features/admin/monitoring-list';

const Search = z.object({ view: LibraryState.optional() });

export const Route = createFileRoute('/admin/monitoring/')({
  validateSearch: (raw: Record<string, unknown>) => Search.parse(raw),
  component: LibraryPage,
});

function LibraryPage() {
  const { view = 'all' } = Route.useSearch();
  const navigate = Route.useNavigate();
  const show = (next: LibraryState) =>
    navigate({ search: { view: next === 'all' ? undefined : next }, replace: true });
  return <MonitoringListPage view={view} onView={show} />;
}
