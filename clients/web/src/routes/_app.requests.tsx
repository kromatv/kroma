import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { RequestsHubPage } from '#web/features/requests/requests-hub';

const Search = z.object({
  tab: z.enum(['mine', 'upcoming', 'missing']).optional().catch(undefined),
});

export const Route = createFileRoute('/_app/requests')({
  validateSearch: (raw: Record<string, unknown>) => Search.parse(raw),
  component: RequestsPage,
});

function RequestsPage() {
  const { tab = 'mine' } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <RequestsHubPage
      tab={tab}
      onTab={(next) =>
        navigate({ search: { tab: next === 'mine' ? undefined : next }, replace: true })
      }
    />
  );
}
