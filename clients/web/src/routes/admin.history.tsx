import { createFileRoute } from '@tanstack/react-router';
import { HistoryScreen } from '#web/features/admin/history';
import { validateHistorySearch } from '#web/features/admin/history-query';

export const Route = createFileRoute('/admin/history')({
  validateSearch: validateHistorySearch,
  component: HistoryRoute,
});

function HistoryRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <HistoryScreen search={search} onSearchChange={(next) => void navigate({ search: next })} />
  );
}
