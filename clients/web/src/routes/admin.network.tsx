import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { NETWORK_TABS, NetworkPage } from '#web/features/admin/network';

const Search = z.object({ tab: z.enum(NETWORK_TABS).optional().catch(undefined) });

export const Route = createFileRoute('/admin/network')({
  validateSearch: (raw: Record<string, unknown>) => Search.parse(raw),
  component: NetworkRoute,
});

function NetworkRoute() {
  const { tab = 'connections' } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <NetworkPage
      tab={tab}
      onTab={(next) =>
        void navigate({ search: { tab: next === 'connections' ? undefined : next }, replace: true })
      }
    />
  );
}
