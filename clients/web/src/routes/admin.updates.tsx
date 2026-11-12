import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ServerUpdatesPage } from '#web/features/admin/server-updates';

const Search = z.object({
  restart: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute('/admin/updates')({
  validateSearch: (raw: Record<string, unknown>) => Search.parse(raw),
  component: UpdatesRoute,
});

function UpdatesRoute() {
  const { restart } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ServerUpdatesPage
      restartAsked={restart}
      onRestartClosed={() => void navigate({ search: {}, replace: true })}
    />
  );
}
