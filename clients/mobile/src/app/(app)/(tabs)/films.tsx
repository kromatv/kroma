import { useQuery } from '@tanstack/react-query';
import { CatalogueScreen } from '../../../components/CatalogueScreen';
import { useT } from '../../../lib/i18n';
import { useClient } from '../../../lib/session';

export default function Films() {
  const t = useT();
  const client = useClient();
  const query = useQuery({ queryKey: ['movies'], queryFn: () => client.movies() });
  return (
    <CatalogueScreen
      title={t('nav.films')}
      entries={query.data}
      kind="movie"
      pending={query.isPending}
      error={query.isError}
      refetch={() => void query.refetch()}
      refreshing={query.isRefetching}
    />
  );
}
