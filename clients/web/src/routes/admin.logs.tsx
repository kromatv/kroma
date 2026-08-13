import { createFileRoute } from '@tanstack/react-router';
import { LogsPage } from '#web/features/admin/logs';

export const Route = createFileRoute('/admin/logs')({
  validateSearch: (s: Record<string, unknown>): { source?: string } => ({
    source: typeof s.source === 'string' ? s.source : undefined,
  }),
  component: LogsRoute,
});

function LogsRoute() {
  const { source } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <LogsPage
      source={source ?? 'all'}
      onSourceChange={(next) =>
        void navigate({ search: { source: next === 'all' ? undefined : next } })
      }
    />
  );
}
