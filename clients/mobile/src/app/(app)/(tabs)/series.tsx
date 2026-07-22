import { useQuery } from '@tanstack/react-query';
import { CatalogueScreen } from '../../../components/CatalogueScreen';
import { useT } from '../../../lib/i18n';
import { useClient } from '../../../lib/session';

export default function Series() {
  const t = useT();
  const client = useClient();
  const query = useQuery({ queryKey: ['shows'], queryFn: () => client.shows() });
  return (
    <CatalogueScreen
      title={t('nav.series')}
      entries={query.data}
      kind="show"
      pending={query.isPending}
      error={query.isError}
      refetch={() => void query.refetch()}
      refreshing={query.isRefetching}
    />
  );
}
