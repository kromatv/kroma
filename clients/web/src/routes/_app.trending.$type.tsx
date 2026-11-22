import type { TmdbKind } from '@kromatv/client/discovery';
import { createFileRoute } from '@tanstack/react-router';
import { TrendingPage } from '#web/features/requests/trending-page.component';
import { requireTrendingKind, validateTrendingSearch } from '#web/features/requests/trending-url';

export const Route = createFileRoute('/_app/trending/$type')({
  beforeLoad: requireTrendingKind,
  validateSearch: validateTrendingSearch,
  component: TrendingRoute,
});

function TrendingRoute() {
  const { type } = Route.useParams();
  const { page = 1 } = Route.useSearch();
  const navigate = Route.useNavigate();
  const kind: TmdbKind = type === 'tv' ? 'tv' : 'movie';
  return (
    <TrendingPage
      kind={kind}
      page={page}
      onKindChange={(next) =>
        navigate({ to: '/trending/$type', params: { type: next }, search: {} })
      }
      onPageChange={(next) => navigate({ search: next > 1 ? { page: next } : {} })}
    />
  );
}
