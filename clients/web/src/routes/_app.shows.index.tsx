import { useT } from '@kromatv/ui';
import { Box } from '@kromatv/ui/kit';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BrowseTitle } from '#web/features/catalog/browse-hero.component';
import { BrowseScreen } from '#web/features/catalog/browse-screen.component';
import { validateBrowseSearch } from '#web/features/catalog/browse-search';
import { ShowGrid } from '#web/features/catalog/cards.component';
import { isAuthed } from '#web/shared/lib/api';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

import { PageFrame, SkeletonRow } from '#web/shared/ui';

export const Route = createFileRoute('/_app/shows/')({
  validateSearch: validateBrowseSearch,
  loader: async ({ context: { runtime: webRuntime, queryClient } }) => {
    if (!isAuthed()) {
      return;
    }
    await queryClient.ensureQueryData(webRuntime.queries.catalogQueries.showsView());
  },
  pendingComponent: ShowsPending,
  component: ShowsPage,
});

function ShowsPending() {
  const t = useT();
  return (
    <PageFrame>
      <BrowseTitle>{t('nav.series')}</BrowseTitle>
      <Box mt={24}>
        <SkeletonRow count={14} />
      </Box>
    </PageFrame>
  );
}

function ShowsPage() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: shows } = useSuspenseQuery(webRuntime.queries.catalogQueries.showsView());

  return (
    <BrowseScreen
      heading={t('nav.series')}
      items={shows}
      countKey="browse.count.series"
      emptyIcon="device-tv"
      emptyTitle={t('content.seriesEmpty')}
      search={search}
      onSearch={(next, opts) =>
        navigate({ search: (p) => ({ ...p, ...next }), resetScroll: opts?.resetScroll })
      }
      renderGrid={(view) => <ShowGrid shows={view} />}
    />
  );
}
