import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { PerformancePage } from '#web/features/admin/performance.component';
import { PERF_TABS, PERF_WINDOWS } from '#web/features/admin/performance-tabs';

const Search = z.object({
  tab: z.enum(PERF_TABS).optional().catch(undefined),
  window: z.enum(PERF_WINDOWS).optional().catch(undefined),
  scope: z.string().optional().catch(undefined),
  segment: z.string().optional().catch(undefined),
  slow: z.string().optional().catch(undefined),
});

export const Route = createFileRoute('/admin/performance')({
  validateSearch: (raw: Record<string, unknown>) => Search.parse(raw),
  component: PerformanceRoute,
});

function PerformanceRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PerformancePage
      search={search}
      onSearch={(next) => void navigate({ search: next, replace: true })}
    />
  );
}
