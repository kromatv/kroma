import { useQuery } from '@tanstack/react-query';
import { CatalogueScreen } from '#mobile/components/catalogue-screen';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';

export default function Films() {
  const t = useT();
  const client = useClient();
  const query = useQuery(client.query.media.movieCards());
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
