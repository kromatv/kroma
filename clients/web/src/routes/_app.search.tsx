import { createFileRoute } from '@tanstack/react-router';
import { SearchPage, validateDiscoverSearch } from '#web/features/requests/search';

export const Route = createFileRoute('/_app/search')({
  validateSearch: validateDiscoverSearch,
  component: () => {
    const { q, type } = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <SearchPage
        query={q}
        type={type}
        setQuery={(q) => navigate({ search: (p) => ({ ...p, q }), replace: true })}
        setType={(type) => navigate({ search: (p) => ({ ...p, type }), replace: true })}
      />
    );
  },
});
