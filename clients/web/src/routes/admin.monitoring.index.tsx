import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { LibraryHubPage, type LibraryTab } from '#web/features/admin/library-hub';
import { LibraryState } from '#web/features/admin/monitoring-index-model';

const Search = z.object({
  tab: z.enum(['titles', 'upcoming', 'requests']).optional().catch(undefined),
  view: LibraryState.optional(),
});

export const Route = createFileRoute('/admin/monitoring/')({
  validateSearch: (raw: Record<string, unknown>) => Search.parse(raw),
  component: LibraryPage,
});

function LibraryPage() {
  const { tab = 'titles', view = 'all' } = Route.useSearch();
  const navigate = Route.useNavigate();
  const go = (next: { tab?: LibraryTab; view?: LibraryState }) =>
    navigate({
      search: (prev) => {
        const merged = { ...prev, ...next };
        return {
          tab: merged.tab === 'titles' ? undefined : merged.tab,
          view: merged.view === 'all' ? undefined : merged.view,
        };
      },
      replace: true,
    });
  return (
    <LibraryHubPage
      tab={tab}
      view={view}
      onTab={(next) => go({ tab: next })}
      onView={(next) => go({ view: next })}
    />
  );
}
